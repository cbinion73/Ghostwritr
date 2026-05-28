import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ArtifactType, BookWorkflowType } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";

import {
  ChapterDraftBundleSchema,
  ChapterReviewBundleSchema,
  FictionDraftArtifactSchema,
  ParagraphOutlineSchema,
  parseArtifactWithSchema,
} from "@/lib/artifact-schemas";
import { getBookBySlugOrThrow } from "@/lib/repositories/books";
import { getLatestEditingArtifactVersion } from "@/lib/repositories/editing-artifacts";
import { getCommittedFictionArtifactVersion } from "@/lib/repositories/fiction-artifacts";
import { getCommittedOutlineExpansion } from "@/lib/repositories/outline-artifacts";
import { getChapterArtifactVersions } from "@/lib/repositories/chapter-draft-artifacts";
import type { ManuscriptExportPayload } from "@/lib/manuscript-document";

const execFileAsync = promisify(execFile);

const ExportPublishingPackageSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().nullable().optional(),
  preparedAt: z.string().optional(),
  trimSize: z.string().optional().nullable(),
  targetPageCount: z.number().nullable().optional(),
  frontMatter: z.array(z.string()).default([]),
  backMatter: z.array(z.string()).default([]),
  exportFormats: z.array(z.enum(["docx", "html", "markdown", "json"])).default([]),
  exportProfiles: z.array(
    z.object({
      format: z.enum(["PRINT", "EBOOK", "AUDIO"]),
      status: z.enum(["ready", "not_requested"]),
      notes: z.array(z.string()),
    }),
  ).default([]),
  typesettingPlan: z
    .object({
      trimProfile: z.string().default("Trim profile pending refresh."),
      chapterOpenerStyle: z.string(),
      runningHeads: z.string(),
      tocIncluded: z.boolean(),
      widowOrphanControl: z.boolean(),
      sectionStartsOnRecto: z.boolean().default(true),
      signaturePageMultiple: z.number().default(16),
      estimatedSignatureCount: z.number().default(0),
      estimatedBlankPages: z.number().default(0),
      estimatedFrontMatterPages: z.number().default(0),
      estimatedBodyPages: z.number().default(0),
      estimatedBackMatterPages: z.number().default(0),
      estimatedTotalPages: z.number().default(0),
      notes: z.array(z.string()),
    })
    .optional(),
  preflightChecks: z
    .array(
      z.object({
        name: z.string(),
        status: z.enum(["pass", "warn", "fail"]),
        detail: z.string(),
      }),
    )
    .default([]),
  notes: z.array(z.string()).default([]),
  packageStatus: z.enum(["draft", "ready_to_publish"]).default("draft"),
});

export type PublishingPackageExport = z.infer<typeof ExportPublishingPackageSchema>;

function countWords(value: string | null | undefined) {
  return value?.split(/\s+/).filter(Boolean).length ?? 0;
}

export function contentDisposition(filename: string): string {
  return `attachment; filename="${filename}"`;
}

export async function convertHtmlToDocx(html: string, filenameBase: string): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), "ghostwritr-manuscript-"));
  const htmlPath = join(tempDir, `${filenameBase}.html`);
  const docxPath = join(tempDir, `${filenameBase}.docx`);

  try {
    await writeFile(htmlPath, html, "utf8");
    await execFileAsync("textutil", ["-convert", "docx", htmlPath, "-output", docxPath]);
    return await readFile(docxPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function getLatestPublishingPackage(slug: string): Promise<PublishingPackageExport | null> {
  const book = await getBookBySlugOrThrow(slug);
  const latestPublishingVersion = await getLatestEditingArtifactVersion(
    book.id,
    ArtifactType.PUBLISHING_PACKAGE,
  );
  return latestPublishingVersion?.contentJson
    ? ExportPublishingPackageSchema.safeParse(latestPublishingVersion.contentJson).data ?? null
    : null;
}

export async function buildManuscriptExportPayload(slug: string): Promise<ManuscriptExportPayload> {
  const book = await getBookBySlugOrThrow(slug);
  const publishingPackage = await getLatestPublishingPackage(slug);

  if (book.workflowType === BookWorkflowType.FICTION) {
    const committedDraftVersion = await getCommittedFictionArtifactVersion(
      book.id,
      ArtifactType.FICTION_DRAFT_MANUSCRIPT,
    );
    const draft = parseArtifactWithSchema(
      committedDraftVersion?.contentJson,
      FictionDraftArtifactSchema,
    );

    if (!draft || draft.chapters.length === 0) {
      throw new Error("Committed fiction Draft is required before manuscript export.");
    }

    return {
      title: book.titleWorking ?? "Untitled Novel",
      subtitle: book.subtitle ?? null,
      totalWords: draft.totalWords,
      chapterCount: draft.chapterCount,
      draftedChapterCount: draft.chapters.length,
      trimSize: publishingPackage?.trimSize ?? null,
      frontMatter: publishingPackage?.frontMatter ?? [],
      backMatter: publishingPackage?.backMatter ?? [],
      chapters: draft.chapters.map((chapter) => ({
        chapterKey: chapter.chapterKey,
        chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.title}`,
        sectionTitle: "Narrative Draft",
        wordCount: chapter.wordCount,
        reviewSummary: null,
        chapterText: chapter.text,
      })),
    };
  }

  const committedOutlineVersion = await getCommittedOutlineExpansion(book.id);
  const outline = parseArtifactWithSchema(
    committedOutlineVersion?.contentJson,
    ParagraphOutlineSchema,
  );

  // ── New-style books: no OUTLINE_EXPANSION — load chapters directly from stage ──
  if (!outline) {
    const chapterStage = await db.bookStage.findUnique({
      where: { bookId_stageKey: { bookId: book.id, stageKey: "CHAPTER_DRAFT" } },
      select: {
        artifacts: {
          select: {
            id: true,
            title: true,
            metadataJson: true,
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

    const rawChapters = chapterStage?.artifacts ?? [];
    const draftedChapters = rawChapters.filter(
      (a) => (a.versions[0]?.contentText?.trim().length ?? 0) > 0,
    );

    if (draftedChapters.length === 0) {
      throw new Error("No chapter drafts exist yet. Finish drafting chapters before exporting the manuscript.");
    }

    const chapters = draftedChapters.map((a, idx) => {
      const meta = a.metadataJson as Record<string, string> | null;
      const chapterKey = meta?.chapterKey ?? `ch-${idx + 1}`;
      const text = a.versions[0]?.contentText ?? "";
      return {
        chapterKey,
        chapterLabel: a.title ?? `Chapter ${idx + 1}`,
        sectionTitle: "",
        wordCount: countWords(text),
        reviewSummary: null,
        chapterText: text,
      };
    });

    return {
      title: book.titleWorking ?? "Untitled Book",
      subtitle: book.subtitle ?? null,
      totalWords: chapters.reduce((sum, c) => sum + c.wordCount, 0),
      chapterCount: chapters.length,
      draftedChapterCount: chapters.length,
      trimSize: publishingPackage?.trimSize ?? null,
      frontMatter: publishingPackage?.frontMatter ?? [],
      backMatter: publishingPackage?.backMatter ?? [],
      chapters,
    };
  }

  // ── Legacy books: load chapters via outline chapter IDs ───────────────────────
  const chapters = await Promise.all(
    outline.sections.flatMap((section) =>
      section.chapters.map(async (chapter) => {
        const [draftVersions, reviewVersions] = await Promise.all([
          getChapterArtifactVersions(book.id, chapter.chapterId, ArtifactType.CHAPTER_DRAFT, 1),
          getChapterArtifactVersions(book.id, chapter.chapterId, ArtifactType.EDITORIAL_REVIEW, 1),
        ]);

        const draft = draftVersions[0]
          ? parseArtifactWithSchema(draftVersions[0].contentJson, ChapterDraftBundleSchema)
          : null;
        const review = reviewVersions[0]
          ? parseArtifactWithSchema(reviewVersions[0].contentJson, ChapterReviewBundleSchema)
          : null;

        return {
          chapterKey: chapter.chapterId,
          chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`,
          sectionTitle: section.sectionTitle,
          wordCount: countWords(draft?.chapterText),
          reviewSummary: review?.overallAssessment ?? null,
          chapterText: draft?.chapterText ?? "",
        };
      }),
    ),
  );

  const draftedChapterCount = chapters.filter((chapter) => chapter.chapterText.trim().length > 0).length;
  if (draftedChapterCount === 0) {
    throw new Error("No chapter drafts exist yet. Finish drafting chapters before exporting the manuscript.");
  }

  return {
    title: book.titleWorking ?? outline.workingTitle ?? "Untitled Book",
    subtitle: book.subtitle ?? null,
    totalWords: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    chapterCount: chapters.length,
    draftedChapterCount,
    trimSize: publishingPackage?.trimSize ?? null,
    frontMatter: publishingPackage?.frontMatter ?? [],
    backMatter: publishingPackage?.backMatter ?? [],
    chapters,
  };
}

export async function buildTypesetPlanInput(slug: string) {
  const payload = await buildManuscriptExportPayload(slug);
  const publishingPackage = await getLatestPublishingPackage(slug);

  return {
    payload,
    plan: {
      trimSize: publishingPackage?.trimSize ?? payload.trimSize ?? null,
      title: payload.title,
      subtitle: payload.subtitle ?? null,
      frontMatter: publishingPackage?.frontMatter ?? payload.frontMatter ?? [],
      backMatter: publishingPackage?.backMatter ?? payload.backMatter ?? [],
      trimProfile: publishingPackage?.typesettingPlan?.trimProfile ?? null,
      runningHeads: publishingPackage?.typesettingPlan?.runningHeads ?? null,
      chapterOpenerStyle: publishingPackage?.typesettingPlan?.chapterOpenerStyle ?? null,
      tocIncluded: publishingPackage?.typesettingPlan?.tocIncluded ?? true,
      sectionStartsOnRecto: publishingPackage?.typesettingPlan?.sectionStartsOnRecto ?? true,
      signaturePageMultiple: publishingPackage?.typesettingPlan?.signaturePageMultiple ?? 16,
      estimatedSignatureCount: publishingPackage?.typesettingPlan?.estimatedSignatureCount ?? null,
      estimatedBlankPages: publishingPackage?.typesettingPlan?.estimatedBlankPages ?? null,
      estimatedFrontMatterPages: publishingPackage?.typesettingPlan?.estimatedFrontMatterPages ?? null,
      estimatedBodyPages: publishingPackage?.typesettingPlan?.estimatedBodyPages ?? null,
      estimatedBackMatterPages: publishingPackage?.typesettingPlan?.estimatedBackMatterPages ?? null,
      estimatedTotalPages: publishingPackage?.typesettingPlan?.estimatedTotalPages ?? null,
    },
    publishingPackage,
  };
}
