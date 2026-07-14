/**
 * Bibliography Generator — deterministic, non-spending bibliography assembly
 * for final production packages.
 *
 * Source of truth:
 *   approved final Opus revision → approved Quill draft version →
 *   draft sourceUsage.researchItemIds / externalStoryItemIds →
 *   structured ResearchSource / ExternalStorySource records.
 *
 * This deliberately does not call an LLM. Formatting is conservative and
 * auditable; incomplete source metadata is surfaced in the gap report instead
 * of being smoothed into fake Chicago-style completeness.
 */

import { ArtifactType, ChapterApprovalStatus, StageKey } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";

const DraftSourceUsageSchema = z.object({
  sourceUsage: z
    .object({
      researchItemIds: z.array(z.string()).default([]),
      externalStoryItemIds: z.array(z.string()).default([]),
    })
    .optional(),
});

const FinalRevisionSchema = z.object({
  changedChapters: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      approvedDraftVersionId: z.string().nullable().optional(),
      revisedText: z.string(),
    }),
  ),
});

type BibliographySource = {
  kind: "research" | "external-story";
  sourceRecordId: string;
  chapterKey: string;
  chapterLabel: string;
  itemId: string;
  itemSummary: string;
  title: string;
  author: string | null;
  publisher: string | null;
  publishedAt: Date | null;
  accessedAt: Date | null;
  url: string;
  canonicalUrl: string | null;
  sourceTier: string;
  verificationStatus: string;
  isVerified: boolean;
};

export type BibliographyGap = {
  severity: "warn" | "fail";
  chapterKey: string;
  chapterLabel: string;
  sourceRecordId?: string;
  sourceTitle?: string;
  detail: string;
};

export type BibliographyReport = {
  generatedAt: string;
  citations: string[];
  sourceCount: number;
  incompleteCitations: BibliographyGap[];
};

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sourceKey(source: BibliographySource) {
  return (
    source.canonicalUrl ??
    source.url ??
    `${source.author ?? "unknown"}:${source.title}:${source.publisher ?? "unknown"}`
  )
    .toLowerCase()
    .trim();
}

function formatDate(value: Date | null) {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function formatSourceCitation(source: BibliographySource) {
  const year = source.publishedAt ? String(source.publishedAt.getUTCFullYear()) : "n.d.";
  const author = source.author?.trim() || null;
  const publisher = source.publisher?.trim() || null;
  const title = source.title.trim();
  const accessed = formatDate(source.accessedAt);
  const url = source.canonicalUrl ?? source.url;

  return [
    author ? `${author}.` : "",
    `${year}.`,
    `"${title}."`,
    publisher ? `${publisher}.` : "",
    accessed ? `Accessed ${accessed}.` : "",
    url,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function citationCueVisible(finalText: string, source: BibliographySource) {
  const haystack = finalText.toLowerCase();
  const authorCue = source.author?.toLowerCase().split(",")[0]?.trim();
  const titleWords = source.title
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length >= 5)
    .slice(0, 3);
  const host = (() => {
    try {
      return new URL(source.canonicalUrl ?? source.url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return null;
    }
  })();

  return Boolean(
    (authorCue && authorCue.length >= 4 && haystack.includes(authorCue)) ||
      (host && haystack.includes(host)) ||
      titleWords.some((word) => haystack.includes(word)),
  );
}

function findSourceGaps(source: BibliographySource, finalText: string): BibliographyGap[] {
  const gaps: BibliographyGap[] = [];
  const missing: string[] = [];
  if (!source.author?.trim()) missing.push("author");
  if (!source.publisher?.trim()) missing.push("publisher/site");
  if (!source.publishedAt) missing.push("publication date");
  if (!source.url?.trim()) missing.push("URL");
  if (!source.isVerified || source.verificationStatus !== "VERIFIED") {
    gaps.push({
      severity: "warn",
      chapterKey: source.chapterKey,
      chapterLabel: source.chapterLabel,
      sourceRecordId: source.sourceRecordId,
      sourceTitle: source.title,
      detail: `Source is ${source.verificationStatus.toLowerCase().replace(/_/g, " ")} rather than verified.`,
    });
  }
  if (missing.length > 0) {
    gaps.push({
      severity: "warn",
      chapterKey: source.chapterKey,
      chapterLabel: source.chapterLabel,
      sourceRecordId: source.sourceRecordId,
      sourceTitle: source.title,
      detail: `Bibliography entry is missing ${missing.join(", ")}.`,
    });
  }
  if (!citationCueVisible(finalText, source)) {
    gaps.push({
      severity: "warn",
      chapterKey: source.chapterKey,
      chapterLabel: source.chapterLabel,
      sourceRecordId: source.sourceRecordId,
      sourceTitle: source.title,
      detail: "Final approved chapter uses this source in Quill's trace, but no obvious author/title/site cue is visible in the final prose.",
    });
  }
  return gaps;
}

export function buildBibliographyHtml(
  bookTitle: string,
  citations: string[],
  incompleteCitations: BibliographyGap[] = [],
): string {
  const items =
    citations.length === 0
      ? `<p><em>No citations were traced from approved final chapters.</em></p>`
      : citations.map((c) => `  <p class="bib-entry">${escHtml(c)}</p>`).join("\n");
  const warnings =
    incompleteCitations.length === 0
      ? ""
      : `<h2>Citation warnings</h2>
${incompleteCitations
  .map(
    (gap) =>
      `<p class="warning"><strong>${escHtml(gap.chapterLabel)}:</strong> ${escHtml(gap.sourceTitle ?? "Source")} — ${escHtml(gap.detail)}</p>`,
  )
  .join("\n")}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Bibliography — ${escHtml(bookTitle)}</title>
  <style>
    body { font-family: "Times New Roman", serif; font-size: 12pt; margin: 2.5cm; line-height: 1.6; }
    h1 { font-size: 16pt; margin-bottom: 1.5em; }
    h2 { font-size: 13pt; margin-top: 2em; }
    .bib-entry { margin: 0 0 0.75em 2em; text-indent: -2em; }
    .warning { color: #7a3f00; margin: 0 0 0.75em; }
  </style>
</head>
<body>
<h1>Bibliography</h1>
${items}
${warnings}
</body>
</html>`;
}

async function loadApprovedFinalChapterInputs(bookId: string) {
  const approvalStates = await db.chapterApprovalState.findMany({
    where: {
      bookId,
      status: ChapterApprovalStatus.FINAL_REVISION_APPROVED,
      isStale: false,
      approvedFinalVersionId: { not: null },
    },
    orderBy: { chapterId: "asc" },
  });

  const chapters: Array<{
    chapterKey: string;
    chapterLabel: string;
    approvedDraftVersionId: string | null;
    finalText: string;
  }> = [];
  const gaps: BibliographyGap[] = [];

  for (const approval of approvalStates) {
    const version = approval.approvedFinalVersionId
      ? await db.artifactVersion.findUnique({
          where: { id: approval.approvedFinalVersionId },
          include: {
            artifact: {
              select: {
                bookId: true,
                artifactType: true,
                stage: { select: { stageKey: true } },
              },
            },
          },
        })
      : null;

    if (
      !version ||
      version.artifact.bookId !== bookId ||
      version.artifact.artifactType !== ArtifactType.MANUSCRIPT_REVISION ||
      version.artifact.stage.stageKey !== StageKey.EDITING
    ) {
      gaps.push({
        severity: "fail",
        chapterKey: approval.chapterId,
        chapterLabel: approval.chapterId,
        detail: "Approved final revision version could not be loaded for bibliography tracing.",
      });
      continue;
    }

    const parsed = FinalRevisionSchema.safeParse(version.contentJson);
    const changed = parsed.data?.changedChapters.find(
      (chapter) => chapter.chapterKey === approval.chapterId,
    );
    if (!changed) {
      gaps.push({
        severity: "fail",
        chapterKey: approval.chapterId,
        chapterLabel: approval.chapterId,
        detail: "Approved final revision does not contain the approved chapter change.",
      });
      continue;
    }

    chapters.push({
      chapterKey: approval.chapterId,
      chapterLabel: changed.chapterLabel,
      approvedDraftVersionId: changed.approvedDraftVersionId ?? approval.approvedDraftVersionId,
      finalText: changed.revisedText,
    });
  }

  return { chapters, gaps };
}

export async function generateBibliography(
  bookId: string,
  bookTitle: string,
): Promise<{ citations: string[]; html: string; report: BibliographyReport }> {
  const { chapters, gaps } = await loadApprovedFinalChapterInputs(bookId);
  const researchItemIds = new Set<string>();
  const storyItemIds = new Set<string>();
  const finalTextByChapter = new Map<string, string>();
  const chapterLabelByChapter = new Map<string, string>();

  for (const chapter of chapters) {
    finalTextByChapter.set(chapter.chapterKey, chapter.finalText);
    chapterLabelByChapter.set(chapter.chapterKey, chapter.chapterLabel);
    if (!chapter.approvedDraftVersionId) {
      gaps.push({
        severity: "fail",
        chapterKey: chapter.chapterKey,
        chapterLabel: chapter.chapterLabel,
        detail: "Approved final revision does not point back to an approved Quill draft for source tracing.",
      });
      continue;
    }

    const draftVersion = await db.artifactVersion.findUnique({
      where: { id: chapter.approvedDraftVersionId },
      select: { contentJson: true },
    });
    const sourceUsage = DraftSourceUsageSchema.safeParse(draftVersion?.contentJson).data?.sourceUsage;
    for (const id of sourceUsage?.researchItemIds ?? []) researchItemIds.add(id);
    for (const id of sourceUsage?.externalStoryItemIds ?? []) storyItemIds.add(id);
  }

  const [researchItems, storyItems] = await Promise.all([
    researchItemIds.size
      ? db.researchItem.findMany({
          where: { id: { in: [...researchItemIds] }, bookId },
          include: { sourceRecord: true },
        })
      : Promise.resolve([]),
    storyItemIds.size
      ? db.externalStoryItem.findMany({
          where: { id: { in: [...storyItemIds] }, bookId },
          include: { sourceRecord: true },
        })
      : Promise.resolve([]),
  ]);

  const sources: BibliographySource[] = [
    ...researchItems.map((item): BibliographySource => ({
      kind: "research",
      sourceRecordId: item.sourceRecordId,
      chapterKey: item.chapterKey,
      chapterLabel: chapterLabelByChapter.get(item.chapterKey) ?? item.chapterKey,
      itemId: item.id,
      itemSummary: item.claimText,
      title: item.sourceRecord.title,
      author: item.sourceRecord.author,
      publisher: item.sourceRecord.publisher,
      publishedAt: item.sourceRecord.publishedAt,
      accessedAt: item.sourceRecord.accessedAt,
      url: item.sourceRecord.url,
      canonicalUrl: item.sourceRecord.canonicalUrl,
      sourceTier: item.sourceRecord.sourceTier,
      verificationStatus: item.sourceRecord.verificationStatus,
      isVerified: item.sourceRecord.isVerified,
    })),
    ...storyItems.map((item): BibliographySource => ({
      kind: "external-story",
      sourceRecordId: item.sourceRecordId,
      chapterKey: item.chapterKey,
      chapterLabel: chapterLabelByChapter.get(item.chapterKey) ?? item.chapterKey,
      itemId: item.id,
      itemSummary: item.title,
      title: item.sourceRecord.title,
      author: item.sourceRecord.author,
      publisher: item.sourceRecord.publisher,
      publishedAt: item.sourceRecord.publishedAt,
      accessedAt: item.sourceRecord.accessedAt,
      url: item.sourceRecord.url,
      canonicalUrl: item.sourceRecord.canonicalUrl,
      sourceTier: item.sourceRecord.sourceTier,
      verificationStatus: item.sourceRecord.verificationStatus,
      isVerified: item.sourceRecord.isVerified,
    })),
  ];

  const deduped = new Map<string, BibliographySource>();
  for (const source of sources) {
    const key = sourceKey(source);
    if (!deduped.has(key)) deduped.set(key, source);
  }

  for (const source of deduped.values()) {
    gaps.push(...findSourceGaps(source, finalTextByChapter.get(source.chapterKey) ?? ""));
  }

  const citations = [...deduped.values()]
    .map(formatSourceCitation)
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  const incompleteCitations = gaps.sort((a, b) =>
    `${a.chapterLabel}:${a.sourceTitle ?? ""}`.localeCompare(`${b.chapterLabel}:${b.sourceTitle ?? ""}`),
  );
  const report: BibliographyReport = {
    generatedAt: new Date().toISOString(),
    citations,
    sourceCount: citations.length,
    incompleteCitations,
  };

  return {
    citations,
    html: buildBibliographyHtml(bookTitle, citations, incompleteCitations),
    report,
  };
}
