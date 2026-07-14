import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { ArtifactType, BookWorkflowType, ChapterApprovalStatus, StageKey } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";

import {
  FictionDraftArtifactSchema,
  ParagraphOutlineSchema,
  parseArtifactWithSchema,
} from "@/lib/artifact-schemas";
import { getBookBySlugOrThrow } from "@/lib/repositories/books";
import { getLatestEditingArtifactVersion } from "@/lib/repositories/editing-artifacts";
import { getCommittedFictionArtifactVersion } from "@/lib/repositories/fiction-artifacts";
import { getCommittedOutlineExpansion } from "@/lib/repositories/outline-artifacts";
import { listChapterApprovalStates } from "@/lib/repositories/chapter-approval-state";
import type { ManuscriptExportPayload } from "@/lib/manuscript-document";
import { normalizeTypesetPlan } from "@/lib/typeset-plan";

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

const FinalManuscriptRevisionSchema = z.object({
  changedChapters: z.array(
    z.object({
      chapterKey: z.string(),
      chapterLabel: z.string(),
      revisedText: z.string(),
      changeSummary: z.string().optional(),
    }),
  ),
});

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
    // `textutil` is macOS-only and doesn't exist on the Linux production
    // container — confirmed live, this silently failed every docx export.
    // pandoc does the same html->docx conversion and is cross-platform.
    await execFileAsync("pandoc", [htmlPath, "-o", docxPath]);
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

  if (!outline) {
    throw new Error("Approved paragraph-level Outline is required before final manuscript export.");
  }

  const outlineChapters = outline.sections.flatMap((section) =>
    section.chapters.map((chapter) => ({
      chapter,
      sectionTitle: section.sectionTitle,
    })),
  );
  const outlineChapterIds = new Set(outlineChapters.map(({ chapter }) => chapter.chapterId));
  const approvalStates = await listChapterApprovalStates(book.id);
  const approvalsByChapterId = new Map(approvalStates.map((state) => [state.chapterId, state]));
  const approvedOrphans = approvalStates
    .filter(
      (state) =>
        state.status === ChapterApprovalStatus.FINAL_REVISION_APPROVED &&
        !outlineChapterIds.has(state.chapterId),
    )
    .map((state) => state.chapterId);

  if (approvedOrphans.length > 0) {
    throw new Error(
      `Final manuscript export found approved chapters outside the approved outline order: ${approvedOrphans.join(", ")}.`,
    );
  }

  const chapters = await Promise.all(
    outlineChapters.map(async ({ chapter, sectionTitle }) => {
      const approval = approvalsByChapterId.get(chapter.chapterId);
      if (
        approval?.status !== ChapterApprovalStatus.FINAL_REVISION_APPROVED ||
        !approval.approvedFinalVersionId
      ) {
        throw new Error(
          `Final manuscript export requires an approved final Opus revision for every chapter. ${chapter.chapterTitle} is not approved.`,
        );
      }

      if (approval.isStale) {
        throw new Error(
          `Final manuscript export blocked because ${chapter.chapterTitle} has a stale final approval${approval.staleReason ? `: ${approval.staleReason}` : "."}`,
        );
      }

      const version = await db.artifactVersion.findUnique({
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
      });

      if (
        !version ||
        version.artifact.bookId !== book.id ||
        version.artifact.artifactType !== ArtifactType.MANUSCRIPT_REVISION ||
        version.artifact.stage.stageKey !== StageKey.EDITING
      ) {
        throw new Error(
          `Final manuscript export could not load the approved final Opus revision for ${chapter.chapterTitle}.`,
        );
      }

      const revision = parseArtifactWithSchema(version.contentJson, FinalManuscriptRevisionSchema);
      const changedChapter = revision?.changedChapters.find(
        (candidate) => candidate.chapterKey === chapter.chapterId,
      );

      if (!changedChapter?.revisedText.trim()) {
        throw new Error(
          `Final manuscript export found no revised text for ${chapter.chapterTitle} in its approved Opus revision.`,
        );
      }

      return {
        chapterKey: chapter.chapterId,
        chapterLabel: `Chapter ${chapter.chapterNumber}: ${chapter.chapterTitle}`,
        sectionTitle,
        wordCount: countWords(changedChapter.revisedText),
        reviewSummary: changedChapter.changeSummary ?? null,
        chapterText: changedChapter.revisedText,
      };
    }),
  );

  return {
    title: book.titleWorking ?? outline.workingTitle ?? "Untitled Book",
    subtitle: book.subtitle ?? null,
    totalWords: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
    chapterCount: chapters.length,
    draftedChapterCount: chapters.length,
    trimSize: publishingPackage?.trimSize ?? null,
    frontMatter: publishingPackage?.frontMatter ?? [],
    backMatter: publishingPackage?.backMatter ?? [],
    chapters,
  };
}

export async function buildTypesetPlanInput(slug: string) {
  const payload = await buildManuscriptExportPayload(slug);
  const publishingPackage = await getLatestPublishingPackage(slug);
  const plan = normalizeTypesetPlan({
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
  });

  return {
    payload,
    plan,
    publishingPackage,
  };
}
