import { PrismaClient, ArtifactType } from "@prisma/client";
import { z } from "zod";

import {
  BaseStoryBundleSchema,
  BookOutlineSchema,
  BookSetupProfileSchema,
  ChapterExternalStoryDossierSchema,
  ChapterDraftBundleSchema,
  ChapterResearchDossierSchema,
  FictionDraftArtifactSchema,
  ParagraphOutlineSchema,
  PlotBlueprintArtifactSchema,
  PromiseBriefSchema,
  ScenePlanArtifactSchema,
  StoryCoreArtifactSchema,
  StorySetupArtifactSchema,
  WorldCastArtifactSchema,
} from "../src/lib/artifact-schemas";

const db = new PrismaClient();

const PublishingPackageSchema = z.object({
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  preparedAt: z.string(),
  totalWords: z.number(),
  chapterCount: z.number(),
  trimSize: z.string(),
  targetPageCount: z.number().nullable().optional(),
  outputFormats: z.array(z.enum(["PRINT", "EBOOK", "AUDIO"])),
  exportFormats: z.array(z.enum(["docx", "html", "markdown", "json"])),
  frontMatter: z.array(z.string()),
  backMatter: z.array(z.string()),
  packageComponents: z.array(z.string()),
  exportProfiles: z.array(
    z.object({
      format: z.enum(["PRINT", "EBOOK", "AUDIO"]),
      status: z.enum(["ready", "not_requested"]),
      notes: z.array(z.string()),
    }),
  ),
  draftQualitySummary: z
    .object({
      averageScore: z.number(),
      chaptersNeedingRevision: z.number(),
      strongChapters: z.number(),
      watchChapters: z.number(),
      attentionChapters: z.number(),
      totalRevisionPasses: z.number(),
      weakestChapterLabel: z.string().nullable(),
      headline: z.string(),
      blockers: z.array(z.string()),
    })
    .nullable()
    .optional(),
  typesettingPlan: z.object({
    trimProfile: z.string(),
    chapterOpenerStyle: z.string(),
    runningHeads: z.string(),
    tocIncluded: z.boolean(),
    widowOrphanControl: z.boolean(),
    sectionStartsOnRecto: z.boolean().default(true),
    signaturePageMultiple: z.number().default(16),
    estimatedSignatureCount: z.number().default(0),
    estimatedBlankPages: z.number().default(0),
    estimatedFrontMatterPages: z.number(),
    estimatedBodyPages: z.number(),
    estimatedBackMatterPages: z.number(),
    estimatedTotalPages: z.number(),
    notes: z.array(z.string()),
  }),
  preflightChecks: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["pass", "warn", "fail"]),
      detail: z.string(),
    }),
  ),
  notes: z.array(z.string()),
  packageStatus: z.enum(["draft", "prepared_needs_editorial_revision", "ready_to_publish"]),
});

type CheckDefinition = {
  slug: string;
  artifactType: ArtifactType;
  schema: z.ZodTypeAny;
  multi?: boolean;
  required?: boolean;
};

const checks: CheckDefinition[] = [
  { slug: "nonfiction-smoke", artifactType: ArtifactType.BOOK_SETUP_PROFILE, schema: BookSetupProfileSchema },
  { slug: "nonfiction-smoke", artifactType: ArtifactType.PROMISE_BRIEF, schema: PromiseBriefSchema },
  { slug: "nonfiction-smoke", artifactType: ArtifactType.OUTLINE, schema: BookOutlineSchema },
  { slug: "nonfiction-smoke", artifactType: ArtifactType.OUTLINE_EXPANSION, schema: ParagraphOutlineSchema },
  { slug: "nonfiction-smoke", artifactType: ArtifactType.BASE_STORY, schema: BaseStoryBundleSchema },
  { slug: "nonfiction-smoke", artifactType: ArtifactType.RESEARCH_PACK, schema: ChapterResearchDossierSchema, multi: true, required: false },
  { slug: "nonfiction-smoke", artifactType: ArtifactType.EXTERNAL_STORY_PACK, schema: ChapterExternalStoryDossierSchema, multi: true, required: false },
  { slug: "nonfiction-smoke", artifactType: ArtifactType.CHAPTER_DRAFT, schema: ChapterDraftBundleSchema, multi: true },
  { slug: "nonfiction-smoke", artifactType: ArtifactType.PUBLISHING_PACKAGE, schema: PublishingPackageSchema },
  { slug: "fiction-smoke", artifactType: ArtifactType.BOOK_SETUP_PROFILE, schema: BookSetupProfileSchema },
  { slug: "fiction-smoke", artifactType: ArtifactType.STORY_SETUP_PROFILE, schema: StorySetupArtifactSchema },
  { slug: "fiction-smoke", artifactType: ArtifactType.STORY_CORE_BIBLE, schema: StoryCoreArtifactSchema },
  { slug: "fiction-smoke", artifactType: ArtifactType.WORLD_CAST_BIBLE, schema: WorldCastArtifactSchema },
  { slug: "fiction-smoke", artifactType: ArtifactType.FICTION_PLOT_BLUEPRINT, schema: PlotBlueprintArtifactSchema },
  { slug: "fiction-smoke", artifactType: ArtifactType.FICTION_SCENE_PLAN, schema: ScenePlanArtifactSchema },
  { slug: "fiction-smoke", artifactType: ArtifactType.FICTION_DRAFT_MANUSCRIPT, schema: FictionDraftArtifactSchema },
  { slug: "fiction-smoke", artifactType: ArtifactType.PUBLISHING_PACKAGE, schema: PublishingPackageSchema },
];

async function main() {
  const results = [];

  for (const check of checks) {
    const book = await db.book.findUnique({ where: { slug: check.slug } });
    if (!book) {
      results.push({
        slug: check.slug,
        artifactType: check.artifactType,
        ok: false,
        issue: "book_missing",
      });
      continue;
    }

    const artifacts = await db.artifact.findMany({
      where: {
        bookId: book.id,
        artifactType: check.artifactType,
        committedVersionId: { not: null },
      },
      include: {
        versions: {
          where: { lifecycleState: "COMMITTED" },
          orderBy: { versionNumber: "desc" },
          take: check.multi ? 20 : 1,
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (artifacts.length === 0) {
      results.push({
        slug: check.slug,
        artifactType: check.artifactType,
        ok: check.required === false,
        issue: check.required === false ? "committed_artifact_not_seeded" : "committed_artifact_missing",
      });
      continue;
    }

    for (const artifact of artifacts) {
      for (const version of artifact.versions) {
        const parsed = check.schema.safeParse(version.contentJson);
        results.push({
          slug: check.slug,
          artifactType: check.artifactType,
          artifactId: artifact.id,
          versionId: version.id,
          versionNumber: version.versionNumber,
          ok: parsed.success,
          issue: parsed.success ? null : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
        });
      }
    }
  }

  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
