import { NextResponse } from "next/server";
import { ActorType, ArtifactType } from "@prisma/client";
import { db } from "@/lib/db";
import { isLikelyGarbageChapterContent } from "@/lib/repositories/artifact-lifecycle";
import { getCommittedOutlineExpansion } from "@/lib/repositories/outline-artifacts";
import type { ParagraphOutline } from "@/lib/paragraph-outline-types";

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
        where: { artifactType: ArtifactType.CHAPTER_DRAFT },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // The real chapter list is the committed outline, not "whatever artifacts
  // happen to exist" — confirmed live: one artifact carried a chapterKey
  // ("ch-1") that doesn't correspond to any outline chapter at all (real,
  // coherent prose, but orphaned legacy content from an earlier abandoned
  // chapter structure, not part of this book). Filtering only on "has some
  // chapterKey" let it back in as a synthetic 17th chapter.
  const committedOutlineVersion = await getCommittedOutlineExpansion(book.id);
  const outline = committedOutlineVersion?.contentJson as ParagraphOutline | undefined;
  const realChapterOrder = (outline?.sections ?? []).flatMap((section) =>
    section.chapters.map((chapter) => chapter.chapterId),
  );
  const realChapterKeys = new Set(realChapterOrder);

  // A chapter can still have more than one Artifact row until it's next
  // committed (the dedup fix only prunes duplicates at commit time, it
  // doesn't retroactively clean up existing ones) — group by chapterKey and
  // prefer the most recently updated candidate that isn't an API error blob
  // or the deterministic fallback text, same as Chapter Draft's own commit
  // logic. Without this, split ran on error blobs and duplicate rows.
  const rawArtifacts = (draftStage?.artifacts ?? []).filter((a) => {
    const meta = a.metadataJson as Record<string, string> | null;
    return typeof meta?.chapterKey === "string" && realChapterKeys.has(meta.chapterKey);
  });
  const byChapterKey = new Map<string, (typeof rawArtifacts)[number]>();
  rawArtifacts.forEach((a) => {
    const meta = a.metadataJson as Record<string, string>;
    const chapterKey = meta.chapterKey;
    const existing = byChapterKey.get(chapterKey);
    if (!existing) {
      byChapterKey.set(chapterKey, a);
      return;
    }
    const existingIsGarbage = isLikelyGarbageChapterContent(existing.versions[0]?.contentText);
    const candidateIsGarbage = isLikelyGarbageChapterContent(a.versions[0]?.contentText);
    if (existingIsGarbage && !candidateIsGarbage) {
      byChapterKey.set(chapterKey, a);
    } else if (existingIsGarbage === candidateIsGarbage && a.updatedAt > existing.updatedAt) {
      byChapterKey.set(chapterKey, a);
    }
  });

  // Order by real book order, not artifact createdAt.
  const chapters = realChapterOrder
    .map((chapterKey) => byChapterKey.get(chapterKey))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((a) => {
      const meta = a.metadataJson as Record<string, string>;
      return {
        chapterKey: meta.chapterKey,
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

  // ── Programmatic split — no LLM needed, no timeout risk ───────────────────
  // Exercises are consistently marked with ### Exercise:, ### Reflection Questions,
  // Author's Workbench, and - [ ] checklist blocks. Find the earliest marker and
  // split there. Fast, deterministic, handles any chapter size.

  function splitChapterProgrammatically(content: string): { bookProse: string; workbookSection: string } {
    const lines = content.split("\n");
    let splitLine = -1;

    // Markers that signal the start of workbook content
    const workbookMarkers = [
      /^###\s+(Exercise|Reflection\s+Questions?|Author['']s\s+Workbench|Diagnostic|Self-Assessment|Workbench)/i,
      /^##\s+(Exercise|Reflection\s+Questions?|Author['']s\s+Workbench|Diagnostic|Self-Assessment)/i,
    ];

    // Also detect a block of checklist items (3+ consecutive - [ ] lines)
    let checklistRunStart = -1;
    let checklistRunCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Named marker found
      if (workbookMarkers.some((rx) => rx.test(line.trim()))) {
        // Walk back past any preceding --- separator
        let start = i;
        if (start > 0 && /^---+\s*$/.test(lines[start - 1]?.trim() ?? "")) start--;
        splitLine = start;
        break;
      }

      // Track checklist runs
      if (/^\s*-\s+\[[ x]\]/.test(line)) {
        if (checklistRunStart === -1) checklistRunStart = i;
        checklistRunCount++;
        if (checklistRunCount >= 3 && splitLine === -1) {
          // Walk back past any preceding --- separator
          let start = checklistRunStart;
          if (start > 0 && /^---+\s*$/.test(lines[start - 1]?.trim() ?? "")) start--;
          splitLine = start;
          break;
        }
      } else {
        checklistRunStart = -1;
        checklistRunCount = 0;
      }
    }

    if (splitLine === -1) {
      // No workbook markers found — entire content is book prose
      return { bookProse: content.trimEnd(), workbookSection: "" };
    }

    const bookLines = lines.slice(0, splitLine);
    const wbLines = lines.slice(splitLine);

    // Trim trailing whitespace/separators from book prose
    while (bookLines.length > 0 && /^\s*$|^---+\s*$/.test(bookLines[bookLines.length - 1] ?? "")) {
      bookLines.pop();
    }

    const bookProse = bookLines.join("\n").trimEnd();
    const rawWorkbook = wbLines.join("\n").trim();
    const workbookSection = rawWorkbook
      ? `## ${chapterTitle}\n\nUse the exercises below as you work through this chapter.\n\n${rawWorkbook}`
      : "";

    return { bookProse, workbookSection };
  }

  const { bookProse, workbookSection } = splitChapterProgrammatically(chapterContent);

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
