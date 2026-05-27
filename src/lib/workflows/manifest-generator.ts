/**
 * Manifest Generator — reads all source materials and produces a per-chapter
 * assignment brief that lets Quill receive only the materials relevant to each chapter.
 *
 * Input: committed OUTLINE + all RESEARCH, EXTERNAL_STORIES, PERSONAL_STORIES artifacts
 * Output: CHAPTER_MANIFEST artifact saved to MANIFEST stage, stage committed
 */

import { db } from "@/lib/db";
import { ArtifactType, StageStatus, ActorType } from "@prisma/client";
import { getModelForRole } from "@/lib/llm/routing";
import { getAgentForStage } from "@/lib/ui/agent-personas";

export async function generateManifest(
  bookId: string,
  onChunk?: (text: string) => void,
): Promise<{ success: boolean; content?: string; error?: string }> {
  // Load book metadata
  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { id: true, titleWorking: true, subtitle: true, metadataJson: true },
  });
  if (!book) return { success: false, error: "Book not found" };

  // Load committed OUTLINE
  const outlineStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId, stageKey: "OUTLINE" } },
    select: {
      artifacts: {
        select: { versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  const outlineText = outlineStage?.artifacts[0]?.versions[0]?.contentText ?? "";
  if (!outlineText) return { success: false, error: "No committed outline found. Commit the Outline stage before generating the manifest." };

  // Load RESEARCH artifacts (all dossiers)
  const researchStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId, stageKey: "RESEARCH" } },
    select: {
      artifacts: {
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
        select: { title: true, versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Load PERSONAL_STORIES artifacts
  const personalStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId, stageKey: "PERSONAL_STORIES" } },
    select: {
      artifacts: {
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
  const manifestStage = await db.bookStage.upsert({
    where: { bookId_stageKey: { bookId, stageKey: "MANIFEST" } },
    update: { status: StageStatus.IN_PROGRESS },
    create: { bookId, stageKey: "MANIFEST", status: StageStatus.IN_PROGRESS },
  });

  // Call LLM — try Haiku first, fall back to gpt-4o-mini if unavailable or failing
  const persona = getAgentForStage("MANIFEST");
  const { HumanMessage, SystemMessage } = await import("@langchain/core/messages");

  // Resolve model: primary = Haiku, fallback = gpt-4o-mini
  const primaryModel = await getModelForRole(persona.stageRole);
  const fallbackModel = primaryModel ? null : await getModelForRole("press:kit"); // openai:gpt-4o-mini

  const model = primaryModel ?? fallbackModel;
  if (!model) {
    return { success: false, error: "No LLM available (checked ANTHROPIC_API_KEY and OPENAI_API_KEY — both missing or invalid)." };
  }

  const messages = [
    new SystemMessage(persona.systemPrompt),
    new HumanMessage(userMessage),
  ];

  let manifestContent = "";
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
    }
  } catch (err) {
    await db.bookStage.update({ where: { id: manifestStage.id }, data: { status: StageStatus.NOT_STARTED } });
    const detail = err instanceof Error ? err.message : "Generation failed";
    // If primary succeeded but gave empty content, that's handled below.
    // Here we surface the real error so it's visible in the UI.
    return { success: false, error: `LLM call failed: ${detail}` };
  }

  if (!manifestContent.trim()) {
    await db.bookStage.update({ where: { id: manifestStage.id }, data: { status: StageStatus.NOT_STARTED } });
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

  await db.artifact.update({ where: { id: artifact.id }, data: { currentVersionId: version.id } });
  await db.bookStage.update({ where: { id: manifestStage.id }, data: { status: StageStatus.COMMITTED } });

  return { success: true, content: manifestContent };
}
