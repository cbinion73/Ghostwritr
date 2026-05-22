import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";
import { buildKdpDocx } from "@/lib/kdp-docx-export";

export const runtime = "nodejs";

/**
 * Extract chapter titles from the [TABLE OF CONTENTS] block in TYPESET front matter.
 * Returns them in document order so we can sort chapters to match.
 */
function extractTocOrder(typesetContent: string): string[] {
  const tocMatch = typesetContent.match(/\[TABLE OF CONTENTS\]([\s\S]*?)(?:\[|$)/);
  if (!tocMatch) return [];
  return tocMatch[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * Sort chapter map entries by TOC order.
 * Entries not found in the TOC are appended at the end.
 * Entries whose title doesn't resemble a real chapter (no ":" separator and
 * not "Introduction", "Closing", "Conclusion", "Afterword", "Prologue",
 * "Epilogue") are filtered out to avoid test artifacts.
 */
function sortByToc(
  chapterMap: Map<string, string>,
  tocOrder: string[]
): Array<[string, string]> {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

  const entries = Array.from(chapterMap.entries());

  // Filter out entries that look like test artifacts (no chapter numbering,
  // no Introduction/Closing/etc., and not present in the TOC)
  const CHAPTER_PATTERNS = /^(introduction|prologue|epilogue|closing|conclusion|afterword|foreword|preface|chapter\s+\d+)/i;
  const inToc = new Set(tocOrder.map(normalize));

  const validEntries = entries.filter(([title]) => {
    if (CHAPTER_PATTERNS.test(title)) return true;
    if (inToc.has(normalize(title))) return true;
    // Check if any TOC entry substantially matches this title
    for (const tocEntry of tocOrder) {
      if (normalize(tocEntry).includes(normalize(title).slice(0, 20)) ||
          normalize(title).includes(normalize(tocEntry).slice(0, 20))) {
        return true;
      }
    }
    return false;
  });

  if (tocOrder.length === 0) return validEntries;

  // Sort by position in TOC
  validEntries.sort(([a], [b]) => {
    const aNorm = normalize(a);
    const bNorm = normalize(b);
    let aIdx = -1;
    let bIdx = -1;
    tocOrder.forEach((toc, i) => {
      const tocNorm = normalize(toc);
      if (aIdx === -1 && (tocNorm === aNorm || tocNorm.includes(aNorm.slice(0, 25)) || aNorm.includes(tocNorm.slice(0, 25)))) aIdx = i;
      if (bIdx === -1 && (tocNorm === bNorm || tocNorm.includes(bNorm.slice(0, 25)) || bNorm.includes(tocNorm.slice(0, 25)))) bIdx = i;
    });
    if (aIdx === -1 && bIdx === -1) return 0;
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });

  return validEntries;
}

/** Skip API error payloads that got saved as artifact content during API outages */
function isErrorContent(text: string): boolean {
  return (
    text.startsWith("⚠") ||
    text.includes('"type":"error"') ||
    text.includes("credit balance") ||
    text.includes("I need an API key")
  );
}

/**
 * Deduplicate chapter artifacts by title, keeping the latest non-error content
 * per title. Returns a Map of title → content in first-seen order (which
 * approximates the chapter drafting order since artifacts are sorted asc).
 */
function deduplicateChapters(
  artifacts: Array<{
    title: string | null;
    versions: Array<{ contentText: string | null }>;
  }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of artifacts) {
    const text = a.versions[0]?.contentText;
    if (!text || isErrorContent(text)) continue;
    const titleKey = (a.title ?? "Chapter").trim();
    // Overwrite on duplicate key — since artifacts are sorted createdAt asc,
    // the last write per title is the most recently drafted version.
    map.set(titleKey, text);
  }
  return map;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const book = await db.book.findUnique({
    where: { slug },
    select: { id: true, titleWorking: true, subtitle: true, workflowType: true },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const format: string = url.searchParams.get("format") ?? "markdown";

  const title = book.titleWorking ?? "Untitled Book";

  if (format === "manuscript" || format === "docx") {
    // Load TYPESET front/back matter
    const typesetStage = await db.bookStage.findUnique({
      where: { bookId_stageKey: { bookId: book.id, stageKey: "TYPESET" } },
      select: { artifacts: { where: { status: "COMMITTED" }, select: { versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 1 } },
    });

    // Load Reed revision artifacts (title starts with "Revised:")
    const editingStage = await db.bookStage.findUnique({
      where: { bookId_stageKey: { bookId: book.id, stageKey: "EDITING" } },
      select: { artifacts: { where: { status: "COMMITTED" }, select: { title: true, versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } }, orderBy: { createdAt: "asc" } } },
    });

    // Load all chapter drafts (any status — REVIEW_READY chapters still have valid content)
    const chapterStage = await db.bookStage.findUnique({
      where: { bookId_stageKey: { bookId: book.id, stageKey: "CHAPTER_DRAFT" } },
      select: { artifacts: { select: { title: true, versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } }, orderBy: { createdAt: "asc" } } },
    });

    // Build chapter map from drafts (deduped, latest per title, no errors)
    const chapterMap = deduplicateChapters(chapterStage?.artifacts ?? []);

    // Overlay Reed revisions: artifacts whose title starts with "Revised:"
    for (const rev of (editingStage?.artifacts ?? [])) {
      if (!rev.title?.startsWith("Revised:")) continue;
      const revText = rev.versions[0]?.contentText;
      if (!revText || isErrorContent(revText)) continue;

      // Normalize Reed title: "Revised: Chapter 2 — How..." → "Chapter 2 — How..."
      const revStripped = rev.title.replace(/^Revised:\s*/, "").trim();

      // Find the best matching chapter key (Reed uses " — " separator, drafts use ": ")
      let matched = false;
      for (const chapterTitle of chapterMap.keys()) {
        const normChapter = chapterTitle.replace(/:\s*/, " — ");
        if (
          normChapter === revStripped ||
          chapterTitle === revStripped ||
          chapterTitle.toLowerCase().includes(revStripped.toLowerCase()) ||
          revStripped.toLowerCase().includes(chapterTitle.replace(/^Chapter \d+:\s*/i, "").toLowerCase())
        ) {
          chapterMap.set(chapterTitle, revText);
          matched = true;
          break;
        }
      }
      // If no match found, add the revision as a standalone entry
      if (!matched) {
        chapterMap.set(revStripped, revText);
      }
    }

    const typesetContent = typesetStage?.artifacts[0]?.versions[0]?.contentText ?? "";

    // Extract TOC order from TYPESET front matter to sort chapters correctly
    const tocOrder = extractTocOrder(typesetContent);
    const orderedChapterEntries = sortByToc(chapterMap, tocOrder);

    const chapterBlocks = orderedChapterEntries
      .map(([t, text]) => `## ${t}\n\n${text}`);

    const backMatterMarker = "=== BACK MATTER ===";
    const frontMatterRaw = typesetContent.includes(backMatterMarker)
      ? typesetContent.split(backMatterMarker)[0].replace("=== FRONT MATTER ===", "").trim()
      : typesetContent.replace("=== FRONT MATTER ===", "").trim();
    const backMatterRaw = typesetContent.includes(backMatterMarker)
      ? typesetContent.split(backMatterMarker)[1]?.trim() ?? ""
      : "";

    const parts: string[] = [];
    if (frontMatterRaw) parts.push(frontMatterRaw);
    if (chapterBlocks.length > 0) parts.push(chapterBlocks.join("\n\n---\n\n"));
    if (backMatterRaw) parts.push(backMatterRaw);

    const manuscriptMd = parts.join("\n\n---\n\n");
    const manuscriptFilename = title.replace(/[^a-z0-9\s]/gi, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 60) + "-manuscript.md";

    if (format === "docx") {
      // ── Build KDP-formatted DOCX ─────────────────────────────────────────
      const meta = (await db.book.findUnique({ where: { slug }, select: { metadataJson: true } }))?.metadataJson as Record<string, unknown> | null;
      const authorName = (meta?.authorName as string) ?? (meta?.authorBioShort as string)?.split(".")[0] ?? "Author";

      const docxBuffer = await buildKdpDocx({
        title,
        subtitle: book.subtitle,
        author: authorName,
        typesetContent,
        chapters: orderedChapterEntries.map(([t, body]) => ({ title: t, body })),
      });

      const docxFilename = title.replace(/[^a-z0-9\s]/gi, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 60) + "-manuscript.docx";

      return new Response(docxBuffer as unknown as BodyInit, {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": `attachment; filename="${docxFilename}"`,
        },
      });
    }

    return new Response(manuscriptMd || "No content available.", {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${manuscriptFilename}"`,
      },
    });
  }

  const stageOrder = getWorkflowStageKeys(book.workflowType);

  // Fetch all stages with their artifact content
  const stages = await db.bookStage.findMany({
    where: { bookId: book.id },
    select: {
      stageKey: true,
      status: true,
      artifacts: {
        select: {
          title: true,
          metadataJson: true,
          status: true,
          versions: {
            select: { contentText: true },
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const stageMap = new Map(stages.map((s) => [s.stageKey, s]));

  const subtitle = book.subtitle;

  const sections: string[] = [];

  for (const key of stageOrder) {
    const stage = stageMap.get(key);
    if (!stage || stage.artifacts.length === 0) continue;

    if (key === "CHAPTER_DRAFT") {
      // Deduplicate by title, skip error content, keep latest per title
      const chapterMap = deduplicateChapters(stage.artifacts);
      const chapterSections = Array.from(chapterMap.entries())
        .map(([chapterTitle, text]) => `## ${chapterTitle}\n\n${text}`);
      if (chapterSections.length > 0) {
        sections.push(`# Chapters\n\n${chapterSections.join("\n\n---\n\n")}`);
      }
    } else {
      // Use the most recent committed artifact, falling back to most recent overall
      const committed = stage.artifacts.filter((a) => a.status === "COMMITTED");
      const best = committed.length > 0
        ? committed[committed.length - 1]
        : stage.artifacts[stage.artifacts.length - 1];
      const contentText = best?.versions[0]?.contentText;
      if (!contentText || isErrorContent(contentText)) continue;
      const artifactTitle = best?.title ?? key.replace(/_/g, " ");
      const statusLabel = stage.status === "COMMITTED" ? "✓ Committed" : "Draft";
      sections.push(`## ${artifactTitle}\n\n_Stage: ${key.replace(/_/g, " ")} · ${statusLabel}_\n\n${contentText}`);
    }
  }

  if (sections.length === 0) {
    return NextResponse.json({ error: "No committed content to export" }, { status: 400 });
  }

  const header = subtitle
    ? `# ${title}\n### ${subtitle}\n`
    : `# ${title}\n`;

  const markdown = `${header}\n---\n\n${sections.join("\n\n---\n\n")}\n`;

  const filename = title
    .replace(/[^a-z0-9\s]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60)
    + "-draft.md";

  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
