import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";
import { buildKdpDocx } from "@/lib/kdp-docx-export";
import { buildManuscriptExportPayload } from "@/lib/manuscript-export";
import { buildManuscriptMarkdown, sanitizeManuscriptFilename } from "@/lib/manuscript-document";

export const runtime = "nodejs";

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
    metadataJson?: unknown;
    versions: Array<{ contentText: string | null }>;
  }>
): Map<string, string> {
  // Group by metadataJson.chapterKey, not title — a chapter can have two
  // Artifact rows with two different titles (a plain agent-chat save writes
  // a bare title; the structured author path writes "Chapter Draft: {key} -
  // {title}"). Deduping by title alone lets both slip through as separate
  // "chapters" in the exported manuscript. Fall back to title only when a
  // row genuinely has no chapterKey tagged.
  const byChapterKey = new Map<string, { titleKey: string; text: string }>();
  for (const a of artifacts) {
    const text = a.versions[0]?.contentText;
    if (!text || isErrorContent(text)) continue;
    const titleKey = (a.title ?? "Chapter").trim();
    const meta = a.metadataJson as Record<string, string> | null | undefined;
    const chapterKey = meta?.chapterKey ?? titleKey;
    // Overwrite on duplicate key — since artifacts are sorted createdAt asc,
    // the last write per chapter is the most recently drafted version.
    byChapterKey.set(chapterKey, { titleKey, text });
  }

  const map = new Map<string, string>();
  for (const { titleKey, text } of byChapterKey.values()) {
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
    // Previously this route had its own independent chapter-sourcing logic
    // (title-based dedup, TOC-block extraction from a legacy TYPESET
    // artifact, chapter-pattern regex filtering) that had drifted out of
    // sync with the real data shape — confirmed live: it produced a docx
    // with zero chapter content, because it dropped every chapter whose
    // title didn't match a "Chapter N:" pattern AND wasn't found in a TOC
    // block that no longer exists for books using the current commit path.
    // Use the one already-correct, chapterKey-based pipeline (same as
    // Publish Package) instead of maintaining a second implementation.
    const payload = await buildManuscriptExportPayload(slug);

    const manuscriptFilename = sanitizeManuscriptFilename(title) + "-manuscript.md";

    if (format === "docx") {
      const meta = (await db.book.findUnique({ where: { slug }, select: { metadataJson: true } }))?.metadataJson as Record<string, unknown> | null;
      const authorName = (meta?.authorName as string) ?? (meta?.authorBioShort as string)?.split(".")[0] ?? "Author";

      const docxBuffer = await buildKdpDocx({
        title,
        subtitle: book.subtitle,
        author: authorName,
        typesetContent: "",
        chapters: payload.chapters.map((c) => ({ title: c.chapterLabel, body: c.chapterText })),
      });

      const docxFilename = sanitizeManuscriptFilename(title) + "-manuscript.docx";

      return new Response(docxBuffer as unknown as BodyInit, {
        headers: {
          "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": `attachment; filename="${docxFilename}"`,
        },
      });
    }

    const manuscriptMd = buildManuscriptMarkdown(payload);

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
