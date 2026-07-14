import { NextResponse } from "next/server";
import { ActorType, type StageKey } from "@prisma/client";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { acquireLLMCallForRole } from "@/lib/llm/routing";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { STAGE_AGENT_MAP } from "@/lib/ui/agent-personas";
import { commitStageAndUnlockNext } from "@/lib/workflows/stage-transition-service";
import {
  REQUEST_LIMITS,
  RequestLimitError,
  acquireBookOperationSlot,
  assertRateLimit,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

const WORKBOOK_DESIGN_KEY = "WORKBOOK_DESIGN" as StageKey;
const CHAPTER_DRAFT_KEY = "CHAPTER_DRAFT" as StageKey;

const stageSelect = {
  status: true,
  artifacts: {
    include: { versions: { orderBy: { versionNumber: "desc" } as const, take: 1 } },
    orderBy: { createdAt: "asc" } as const,
  },
} as const;

// GET — returns all chapters with their current content and enrichment status
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const wdStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: WORKBOOK_DESIGN_KEY } },
    select: stageSelect,
  });

  // Fall back to CHAPTER_DRAFT if WORKBOOK_DESIGN stage doesn't exist yet
  const cdStage = wdStage === null
    ? await db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: CHAPTER_DRAFT_KEY } },
        select: stageSelect,
      })
    : null;

  const chapterStage = wdStage ?? cdStage;

  const artifacts = chapterStage?.artifacts ?? [];
  const chapters = artifacts.map((a, idx) => {
    const meta = a.metadataJson as Record<string, string> | null;
    const chapterKey = meta?.chapterKey ?? `ch-${idx + 1}`;
    const content = a.versions[0]?.contentText ?? "";
    // Detect if already enriched: look for "### About This Chapter" or "### Think About It"
    const isEnriched = /###\s+About This Chapter/i.test(content) || /###\s+Think About It/i.test(content);
    return {
      chapterKey,
      chapterTitle: a.title ?? `Chapter ${idx + 1}`,
      artifactId: a.id,
      content,
      isEnriched,
    };
  });

  return NextResponse.json({ chapters, stageStatus: chapterStage?.status ?? "NOT_STARTED" });
}

// POST — enrich one chapter with Sage
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  let body: {
    artifactId: string;
    chapterTitle: string;
    rawContent: string;
  };
  try {
    body = await parseLimitedJson(req, {
      limitBytes: REQUEST_LIMITS.chatJsonBytes,
      label: "Workbook design request",
    });
    assertRateLimit({
      key: `workbook-design:${book.id}`,
      limit: REQUEST_LIMITS.generationRequestsPerWindow,
      windowMs: REQUEST_LIMITS.apiWindowMs,
    });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { artifactId, chapterTitle, rawContent } = body;

  if (!artifactId || !chapterTitle || !rawContent) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const persona = STAGE_AGENT_MAP[WORKBOOK_DESIGN_KEY];
  if (!persona) return NextResponse.json({ error: "Sage persona not found" }, { status: 500 });

  const gatewayCall = await acquireLLMCallForRole("chapter-draft:author", {}, {
    bookId: book.id,
    bookSlug: slug,
    bookTitle: book.titleWorking ?? undefined,
    stageKey: WORKBOOK_DESIGN_KEY,
    chapterKey: artifactId,
    operation: "workbook-design-enrich",
  }); // Sonnet
  const model = gatewayCall?.model;
  if (!model) return NextResponse.json({ error: "No model available" }, { status: 500 });

  let releaseBookSlot: () => void;
  try {
    releaseBookSlot = acquireBookOperationSlot(book.id, "generation");
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }

  let enriched = "";
  let promptTokens = 0;
  let completionTokens = 0;
  const startMs = Date.now();
  try {
    const stream = await model.stream([
      new SystemMessage(persona.systemPrompt),
      new HumanMessage(`Enrich this workbook chapter:\n\nChapter Title: ${chapterTitle}\n\nRaw exercises:\n\n${rawContent}`),
    ]);
    for await (const chunk of stream) {
      const text = typeof chunk.content === "string"
        ? chunk.content
        : Array.isArray(chunk.content)
          ? chunk.content
              .filter((c): c is { type: "text"; text: string } => typeof c === "object" && c !== null && "text" in c)
              .map(c => c.text)
              .join("")
          : "";
      enriched += text;
      const usage = (chunk as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
      if (usage) {
        if (usage.input_tokens) promptTokens = usage.input_tokens;
        if (usage.output_tokens) completionTokens = usage.output_tokens;
      }
    }
  } catch (err) {
    console.error("Sage LLM call failed:", err);
    return NextResponse.json({ error: "LLM call failed" }, { status: 500 });
  } finally {
    releaseBookSlot();
  }

  if (promptTokens > 0 || completionTokens > 0) {
    void gatewayCall.recordUsage({
      promptTokens,
      completionTokens,
      durationMs: Date.now() - startMs,
    }).catch(() => {/* non-fatal */});
  }

  if (!enriched.trim()) {
    return NextResponse.json({ error: "Empty response from model" }, { status: 422 });
  }

  // Save enriched content as new version
  const artifact = await db.artifact.findFirst({
    where: { id: artifactId, bookId: book.id },
    select: { id: true, versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });

  const nextVer = (artifact.versions[0]?.versionNumber ?? 0) + 1;
  const newVersion = await db.artifactVersion.create({
    data: {
      artifactId,
      versionNumber: nextVer,
      lifecycleState: "REVIEW_READY",
      contentJson: { text: enriched },
      contentText: enriched,
      createdByType: ActorType.MODEL,
    },
  });
  await db.artifact.update({
    where: { id: artifactId },
    data: { currentVersionId: newVersion.id },
  });

  return NextResponse.json({ enrichedContent: enriched });
}

// PATCH — mark WORKBOOK_DESIGN as COMMITTED and advance TYPESET to IN_PROGRESS
export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const wdStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: WORKBOOK_DESIGN_KEY } },
  });
  if (!wdStage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

  await commitStageAndUnlockNext({
    bookId: book.id,
    workflowType: book.workflowType,
    stageKey: WORKBOOK_DESIGN_KEY,
    committedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
