import { NextResponse } from "next/server";
import { ActorType } from "@prisma/client";
import { db } from "@/lib/db";
import { getModelForRole } from "@/lib/llm/routing";
import { HumanMessage } from "@langchain/core/messages";

// GET — returns all CHAPTER_DRAFT chapters with their current content
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const draftStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "CHAPTER_DRAFT" } },
    select: {
      status: true,
      artifacts: {
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const chapters = (draftStage?.artifacts ?? []).map((a, idx) => {
    const meta = a.metadataJson as Record<string, string> | null;
    const chapterKey = meta?.chapterKey ?? `ch-${idx + 1}`;
    return {
      chapterKey,
      chapterTitle: a.title,
      sourceDraftId: a.id,
      sourceContent: a.versions[0]?.contentText ?? "",
    };
  });

  return NextResponse.json({
    chapters,
    stageStatus: draftStage?.status ?? "NOT_STARTED",
  });
}

// POST — split one chapter into book prose + workbook section
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const book = await db.book.findUnique({ where: { slug }, select: { id: true } });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = await req.json() as {
    chapterKey: string;
    chapterTitle: string;
    sourceDraftId: string;
    chapterContent: string;
  };
  const { chapterKey, chapterTitle, sourceDraftId, chapterContent } = body;

  if (!chapterKey || !chapterTitle || !sourceDraftId || !chapterContent) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Use typeset:plan (gpt-5.4-mini) or fall back to manifest:generate (Haiku) for this classification task
  const model = await getModelForRole("manifest:generate", { maxOutputTokens: 16000 });
  if (!model) {
    return NextResponse.json({ error: "No LLM model available" }, { status: 503 });
  }

  const prompt = `You are splitting a nonfiction book chapter into two products.

BOOK PROSE: The complete teaching content — narrative, case studies, frameworks, examples. Remove all exercises, checklists (- [ ] items), reflection questions, and Author's Workbench sections. If the chapter ends abruptly after removal, add a brief closing sentence to land the chapter cleanly.

WORKBOOK SECTION: The practical tools only — diagnostic checklists (- [ ] items), exercises (### Exercise:), reflection questions (### Reflection Questions), Author's Workbench sections. If the chapter contains tools, start with "## ${chapterTitle}" as a header, then a one-sentence bridge ("Use the exercises below as you read this chapter."), then the extracted tools verbatim.

CRITICAL: If the chapter contains NO exercises, checklists, reflection questions, or workbench sections, return an empty string "" for workbookSection. Do NOT invent exercises. Do NOT return a stub with just a header and no tools.

Return ONLY valid JSON, no other text:
{"bookProse":"...","workbookSection":""}

CHAPTER TITLE: ${chapterTitle}

CHAPTER CONTENT:
${chapterContent}`;

  let rawResponse: string;
  try {
    const result = await model.invoke([new HumanMessage(prompt)]);
    rawResponse = typeof result.content === "string"
      ? result.content
      : Array.isArray(result.content)
        ? result.content.map((c) => (typeof c === "string" ? c : ("text" in c ? c.text : ""))).join("")
        : "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Strip markdown code fences if present
  const cleaned = rawResponse
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let bookProse: string;
  let workbookSection: string;
  try {
    const parsed = JSON.parse(cleaned) as { bookProse: string; workbookSection: string };
    bookProse = parsed.bookProse ?? "";
    workbookSection = parsed.workbookSection ?? "";
  } catch {
    // Try to extract with regex as fallback
    const proseMatch = cleaned.match(/"bookProse"\s*:\s*"([\s\S]+?)(?:",\s*"workbookSection"|"\s*\})/);
    const wbMatch = cleaned.match(/"workbookSection"\s*:\s*"([\s\S]+?)"\s*\}/);
    if (!proseMatch?.[1] || !wbMatch?.[1]) {
      return NextResponse.json({ error: "Failed to parse LLM JSON response" }, { status: 500 });
    }
    bookProse = proseMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    workbookSection = wbMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }

  const wordCount = bookProse.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount <= 200) {
    return NextResponse.json({ error: "Book prose too short — split may have failed" }, { status: 422 });
  }

  // Save clean book prose as a new version on the source CHAPTER_DRAFT artifact
  const sourceDraft = await db.artifact.findFirst({
    where: { id: sourceDraftId, bookId: book.id },
    select: {
      id: true,
      versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  if (sourceDraft) {
    const nextVer = (sourceDraft.versions[0]?.versionNumber ?? 0) + 1;
    const newVersion = await db.artifactVersion.create({
      data: {
        artifactId: sourceDraftId,
        versionNumber: nextVer,
        lifecycleState: "REVIEW_READY",
        contentJson: { text: bookProse },
        contentText: bookProse,
        createdByType: ActorType.MODEL,
      },
    });
    await db.artifact.update({
      where: { id: sourceDraftId },
      data: { currentVersionId: newVersion.id },
    });
  }

  return NextResponse.json({ bookProse, workbookSection });
}
