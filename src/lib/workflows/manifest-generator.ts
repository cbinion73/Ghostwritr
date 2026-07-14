/**
 * Manifest Generator — reads all source materials and produces a per-chapter
 * assignment brief that lets Quill receive only the materials relevant to each chapter.
 *
 * Input: committed OUTLINE + all RESEARCH, EXTERNAL_STORIES, PERSONAL_STORIES artifacts
 * Output: CHAPTER_MANIFEST artifact saved to MANIFEST stage, stage committed
 */

import { db } from "@/lib/db";
import { ArtifactType, ActorType } from "@prisma/client";
import { acquireLLMCallForRole } from "@/lib/llm/routing";
import { getAgentForStage } from "@/lib/ui/agent-personas";
import { getCommittedOutline } from "@/lib/repositories/outline-artifacts";
import {
  commitStageAndUnlockNext,
  ensureStageStarted,
  resetStageToNotStarted,
} from "@/lib/workflows/stage-transition-service";

export async function generateManifest(
  bookId: string,
  onChunk?: (text: string) => void,
  attribution: { bookSlug?: string; bookTitle?: string } = {},
): Promise<{ success: boolean; content?: string; error?: string }> {
  // Load book metadata
  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { id: true, titleWorking: true, subtitle: true, metadataJson: true, workflowType: true },
  });
  if (!book) return { success: false, error: "Book not found" };

  // Load committed OUTLINE. A BookStage's `artifacts` relation isn't
  // exclusively OUTLINE-type rows — paragraph-level planning artifacts
  // (e.g. CHAPTER_PARAGRAPH_PLAN) are stored under the same stage and can
  // be created well after the outline is committed. The previous query took
  // "most recently created artifact under this stage" with no artifactType
  // filter, so on any book with later planning activity it would pick up
  // one of those instead of the real outline and see empty content —
  // reporting "no committed outline" even when one existed and was
  // committed. getCommittedOutline() filters correctly.
  const outlineVersion = await getCommittedOutline(bookId);
  const outlineText = outlineVersion?.contentText ?? "";
  if (!outlineText) return { success: false, error: "No committed outline found. Commit the Outline stage before generating the manifest." };

  // Load RESEARCH artifacts (all dossiers)
  const researchStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId, stageKey: "RESEARCH" } },
    select: {
      artifacts: {
        where: { artifactType: ArtifactType.RESEARCH_PACK },
        select: { title: true, versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Load EXTERNAL_STORIES artifacts
  const externalStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId, stageKey: "EXTERNAL_STORIES" } },
    select: {
      artifacts: {
        where: { artifactType: ArtifactType.EXTERNAL_STORY_PACK },
        select: { title: true, versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Load PERSONAL_STORIES artifacts. This stage also holds
  // PERSONAL_STORY_CHAT (the raw interview transcript) alongside
  // PERSONAL_STORY_ENCYCLOPEDIA (the actual story bank) — without this
  // filter the manifest prompt was getting the chat transcript fed in
  // alongside, or instead of, the real story bank content.
  const personalStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId, stageKey: "PERSONAL_STORIES" } },
    select: {
      artifacts: {
        where: { artifactType: ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA },
        select: { title: true, versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Per-artifact cap: keep titles + opening content to avoid context overflow.
  // With 50–90 artifacts, uncapped content easily exceeds 300k tokens.
  // 3000 chars ≈ ~750 tokens — enough to capture the thesis and key evidence.
  const CAP = 3000;
  const cap = (text: string) => text.length > CAP ? text.slice(0, CAP) + "\n…[truncated for manifest]" : text;

  // Build source material sections
  const researchSections = (researchStage?.artifacts ?? [])
    .map((a) => { const t = a.versions[0]?.contentText; return t ? `=== SCOUT: ${a.title ?? "Research Dossier"} ===\n${cap(t)}` : null; })
    .filter(Boolean).join("\n\n");

  const externalSections = (externalStage?.artifacts ?? [])
    .map((a) => { const t = a.versions[0]?.contentText; return t ? `=== CHRONICLE: ${a.title ?? "External Stories"} ===\n${cap(t)}` : null; })
    .filter(Boolean).join("\n\n");

  const personalSections = (personalStage?.artifacts ?? [])
    .map((a) => { const t = a.versions[0]?.contentText; return t ? `=== PERSONAL: ${a.title ?? "Personal Stories"} ===\n${cap(t)}` : null; })
    .filter(Boolean).join("\n\n");

  const meta = book.metadataJson && typeof book.metadataJson === "object" ? book.metadataJson as Record<string, unknown> : {};

  const userMessage = `Generate the complete Chapter Manifest for this book.

BOOK: ${book.titleWorking ?? "(untitled)"}${book.subtitle ? ` — ${book.subtitle}` : ""}
${meta.premise ? `PREMISE: ${meta.premise}` : ""}
${meta.promise ? `PROMISE: ${meta.promise}` : ""}
${meta.targetReader ? `TARGET READER: ${meta.targetReader}` : ""}

COMMITTED OUTLINE:
${outlineText}

${researchSections ? `SCOUT RESEARCH DOSSIERS:\n${researchSections}` : "SCOUT RESEARCH: None committed yet."}

${externalSections ? `CHRONICLE EXTERNAL STORIES:\n${externalSections}` : "CHRONICLE: None committed yet."}

${personalSections ? `PERSONAL STORY BANK:\n${personalSections}` : "PERSONAL STORIES: None committed yet."}

Produce the full manifest now, covering every chapter in the outline. Use exact artifact titles as they appear in the headers above (e.g., "SCOUT: Research Dossier — Chapter 3").`;

  // Get or create MANIFEST stage
  const manifestStage = await ensureStageStarted({ bookId, stageKey: "MANIFEST" });

  // Call LLM — try Haiku first, fall back to gpt-4o-mini if unavailable or failing
  const persona = getAgentForStage("MANIFEST");
  const { HumanMessage, SystemMessage } = await import("@langchain/core/messages");

  // Resolve model: primary = Haiku, fallback = gpt-4o-mini
  const gatewayCall = await acquireLLMCallForRole(
    persona.stageRole,
    {},
    {
      bookId,
      bookSlug: attribution.bookSlug,
      bookTitle: attribution.bookTitle ?? book.titleWorking ?? undefined,
      stageKey: "MANIFEST",
      operation: "manifest-generate",
    },
    "press:kit",
  );
  const model = gatewayCall?.model;
  if (!model) {
    return { success: false, error: "No LLM available (checked ANTHROPIC_API_KEY and OPENAI_API_KEY — both missing or invalid)." };
  }

  const messages = [
    new SystemMessage(persona.systemPrompt),
    new HumanMessage(userMessage),
  ];

  let manifestContent = "";
  let promptTokens = 0;
  let completionTokens = 0;
  const startMs = Date.now();
  try {
    const stream = await model.stream(messages);
    for await (const chunk of stream) {
      const text = typeof chunk.content === "string"
        ? chunk.content
        : Array.isArray(chunk.content)
          ? chunk.content.filter((c): c is { type: "text"; text: string } => typeof c === "object" && "text" in c).map((c) => c.text).join("")
          : "";
      if (text) {
        manifestContent += text;
        onChunk?.(text); // forward each token to the SSE stream to keep the connection alive
      }
      const usage = (chunk as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
      if (usage) {
        if (usage.input_tokens) promptTokens = usage.input_tokens;
        if (usage.output_tokens) completionTokens = usage.output_tokens;
      }
    }
  } catch (err) {
    await resetStageToNotStarted({ bookId, stageKey: "MANIFEST" });
    const detail = err instanceof Error ? err.message : "Generation failed";
    // If primary succeeded but gave empty content, that's handled below.
    // Here we surface the real error so it's visible in the UI.
    return { success: false, error: `LLM call failed: ${detail}` };
  }

  if (promptTokens > 0 || completionTokens > 0) {
    void gatewayCall.recordUsage({
      promptTokens,
      completionTokens,
      durationMs: Date.now() - startMs,
    }).catch(() => {/* non-fatal */});
  }

  if (!manifestContent.trim()) {
    await resetStageToNotStarted({ bookId, stageKey: "MANIFEST" });
    return { success: false, error: "No content generated" };
  }

  // Save artifact
  const artifact = await db.artifact.create({
    data: {
      bookId,
      stageId: manifestStage.id,
      artifactType: ArtifactType.CHAPTER_MANIFEST,
      title: `Chapter Manifest — ${book.titleWorking ?? "Untitled"}`,
      status: "COMMITTED",
    },
  });

  const version = await db.artifactVersion.create({
    data: {
      artifactId: artifact.id,
      versionNumber: 1,
      lifecycleState: "COMMITTED",
      contentJson: { text: manifestContent },
      contentText: manifestContent,
      createdByType: ActorType.MODEL,
    },
  });

  await db.artifact.update({
    where: { id: artifact.id },
    data: { currentVersionId: version.id, committedVersionId: version.id },
  });
  await commitStageAndUnlockNext({
    bookId,
    workflowType: book.workflowType,
    stageKey: "MANIFEST",
    committedArtifactVersionId: version.id,
    unlockNext: false,
  });

  return { success: true, content: manifestContent };
}
