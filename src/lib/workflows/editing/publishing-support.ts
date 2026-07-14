import { BookWorkflowType } from "@prisma/client";
import { z } from "zod";

import { BookSetupProfileSchema } from "../../artifact-schemas";
import type {
  DraftQualityRollup,
  EditorialPreferenceProfile,
  EditorialReadinessGate,
  EditorialRevisionPlanExecution,
  ManuscriptAssembly,
  MarketingHandoffPackage,
  PublishingPackage,
  ProvenanceReport,
} from "../../editing-types";
import { estimatePagesFromWords } from "../../manuscript-metrics";

export const EDITING_PUBLISHING_COMMIT_EXTRACTION_DEPENDENCIES = {
  publicEntrypoint: "src/lib/workflows/editing-public.ts",
  temporarySource: "src/lib/workflows/editing.ts",
  assemblyOwner: "src/lib/workflows/editing/assembly.ts",
  publishingOwner: "src/lib/workflows/editing/publishing.ts",
  commitOwner: "src/lib/workflows/editing/commit.ts",
  supportOwner: "src/lib/workflows/editing/publishing-support.ts",
  publicWorkflows: [
    "assembleManuscriptWorkflow",
    "preparePublishingPackageWorkflow",
    "finalizePublishingHandoffWorkflow",
    "commitEditingStageWorkflow",
    "runFullEditorialLoopWorkflow",
  ],
  pureHelpers: [
    "buildPublishingPackage",
    "buildProvenanceReport",
    "buildMarketingHandoffPackage",
  ],
  artifactMutations: [
    "createEditingArtifactVersion:PUBLISHING_PACKAGE",
    "commitEditingArtifact:MANUSCRIPT_ASSEMBLY",
    "commitEditingArtifact:PUBLISHING_PACKAGE",
    "createEditingArtifactVersion:PROVENANCE_REPORT",
    "commitEditingArtifact:PROVENANCE_REPORT",
    "createEditingArtifactVersion:MARKETING_HANDOFF_PACKAGE",
    "commitEditingArtifact:MARKETING_HANDOFF_PACKAGE",
  ],
  stageMetadataFields: [
    "automationStatus",
    "assembledAt",
    "preparedAt",
    "publishPackageSourceAssemblyVersionId",
    "publishPackageRefreshedAt",
    "publishDerivedRefreshedAt",
    "finalHandoffState",
    "editorialReadinessGate",
  ],
  externalStateUpdates: [
    "clearStageStaleDependency",
    "updateBookMetadata",
    "updateStageForBook",
  ],
} as const;

export function buildPublishingPackage(params: {
  assembly: ManuscriptAssembly;
  workflowType: BookWorkflowType;
  bookSetup: z.infer<typeof BookSetupProfileSchema> | null;
  draftQualityRollup?: DraftQualityRollup | null;
  editorialRecommendation?: EditorialReadinessGate["recommendation"] | null;
}): PublishingPackage {
  const {
    assembly,
    workflowType,
    bookSetup,
    draftQualityRollup = null,
    editorialRecommendation = null,
  } = params;
  const trimSize = bookSetup?.trimSize ?? "6 x 9 in";
  const outputFormats = bookSetup?.outputFormats ?? ["PRINT", "EBOOK"];
  const tocIncluded = workflowType !== BookWorkflowType.FICTION;
  const frontMatter =
    workflowType === BookWorkflowType.FICTION
      ? ["Title page", "Copyright page", "Dedication", "Author note (optional)"]
      : ["Title page", "Copyright page", "Table of contents", "Introduction or preface"];
  const backMatter =
    workflowType === BookWorkflowType.FICTION
      ? ["Acknowledgments", "About the author", "Reader discussion questions (optional)"]
      : ["Acknowledgments", "About the author", "Notes / references", "Call to action"];
  const averageChapterWords =
    assembly.chapterCount > 0 ? Math.round(assembly.totalWords / assembly.chapterCount) : 0;
  const shortestChapterWords = assembly.chapters.reduce(
    (smallest, chapter) => Math.min(smallest, chapter.wordCount),
    Number.POSITIVE_INFINITY,
  );
  const longestChapterWords = assembly.chapters.reduce(
    (largest, chapter) => Math.max(largest, chapter.wordCount),
    0,
  );
  const estimatedFrontMatterPages = Math.max(2, frontMatter.length + (tocIncluded ? 1 : 0));
  const estimatedBodyPages = Math.max(
    assembly.chapterCount,
    estimatePagesFromWords(assembly.totalWords, trimSize) + Math.ceil(assembly.chapterCount / 2),
  );
  const estimatedBackMatterPages = Math.max(1, backMatter.length);
  const estimatedTotalPages = estimatedFrontMatterPages + estimatedBodyPages + estimatedBackMatterPages;
  const signaturePageMultiple = 16;
  const estimatedBlankPages =
    estimatedTotalPages % signaturePageMultiple === 0
      ? 0
      : signaturePageMultiple - (estimatedTotalPages % signaturePageMultiple);
  const estimatedSignatureCount = Math.max(
    1,
    Math.ceil((estimatedTotalPages + estimatedBlankPages) / signaturePageMultiple),
  );
  const targetPageCount = bookSetup?.targetPageCount ?? null;
  const pageDelta = targetPageCount ? estimatedTotalPages - targetPageCount : null;
  const chapterLengthVariance =
    averageChapterWords > 0 ? longestChapterWords / Math.max(1, averageChapterWords) : 1;
  const trimProfile = `${trimSize} trade layout with ${averageChapterWords.toLocaleString()} average words per chapter and an estimated ${estimatedTotalPages.toLocaleString()} interior pages.`;
  const typesettingPlan: PublishingPackage["typesettingPlan"] = {
    trimProfile,
    chapterOpenerStyle:
      workflowType === BookWorkflowType.FICTION
        ? "Full-bleed chapter opener with title-only spread and scene-forward spacing."
        : "Clean chapter opener with chapter number, title, and generous top margin.",
    runningHeads:
      workflowType === BookWorkflowType.FICTION
        ? "Book title on verso, chapter title on recto."
        : "Book title on verso, section or chapter title on recto.",
    tocIncluded,
    widowOrphanControl: true,
    sectionStartsOnRecto: true,
    signaturePageMultiple,
    estimatedSignatureCount,
    estimatedBlankPages,
    estimatedFrontMatterPages,
    estimatedBodyPages,
    estimatedBackMatterPages,
    estimatedTotalPages,
    notes: [
      `Estimated interior: ${estimatedFrontMatterPages} front-matter pages, ${estimatedBodyPages} body pages, ${estimatedBackMatterPages} back-matter pages.`,
      `The current estimate fills ${estimatedSignatureCount} print signature(s) of ${signaturePageMultiple} pages with ${estimatedBlankPages} blank page(s) reserved for recto starts and production fit.`,
      "Final interior pass should confirm chapter openers, page turns, and blank-page handling.",
      "Manual QA should confirm that extracted front and back matter map cleanly into the final layout toolchain.",
    ],
  };
  const preflightChecks: PublishingPackage["preflightChecks"] = [
    {
      name: "Manuscript assembly committed",
      status: "pass",
      detail: "The manuscript exists as a full assembled artifact ready for export.",
    },
    {
      name: "Front matter mapped",
      status: frontMatter.length > 0 ? "pass" : "fail",
      detail: frontMatter.length > 0
        ? `${frontMatter.length} front matter elements are defined for layout.`
        : "No front matter elements are defined yet.",
    },
    {
      name: "Back matter mapped",
      status: backMatter.length > 0 ? "pass" : "fail",
      detail: backMatter.length > 0
        ? `${backMatter.length} back matter elements are defined for layout.`
        : "No back matter elements are defined yet.",
    },
    {
      name: "Draft quality baseline",
      status:
        !draftQualityRollup
          ? "warn"
          : draftQualityRollup.chaptersNeedingRevision === 0
            ? "pass"
            : draftQualityRollup.chaptersNeedingRevision >= 3
              ? "fail"
              : "warn",
      detail: !draftQualityRollup
        ? "No chapter-level draft quality telemetry was available when this package was prepared."
        : `Average draft quality is ${draftQualityRollup.averageScore}/100, with ${draftQualityRollup.chaptersNeedingRevision} chapter(s) still marked for revision.`,
    },
    {
      name: "Print profile",
      status: outputFormats.includes("PRINT") ? "pass" : "warn",
      detail: outputFormats.includes("PRINT")
        ? `Print output is enabled for ${trimSize}.`
        : "Print output is not requested in Book Setup.",
    },
    {
      name: "Ebook profile",
      status: outputFormats.includes("EBOOK") ? "pass" : "warn",
      detail: outputFormats.includes("EBOOK")
        ? "Ebook output is enabled and can use HTML/Markdown exports."
        : "Ebook output is not requested in Book Setup.",
    },
    {
      name: "Target page count",
      status: targetPageCount ? "pass" : "warn",
      detail: targetPageCount
        ? `Target page count is set to ${targetPageCount}.`
        : "No target page count is set; final pagination will need manual direction.",
    },
    {
      name: "Interior page estimate",
      status: assembly.totalWords > 0 ? "pass" : "fail",
      detail:
        assembly.totalWords > 0
          ? `Estimated ${estimatedTotalPages} total pages from ${assembly.totalWords.toLocaleString()} manuscript words at ${trimSize}.`
          : "The manuscript has no words yet, so the interior page estimate cannot be trusted.",
    },
    {
      name: "Page target alignment",
      status:
        targetPageCount == null
          ? "warn"
          : Math.abs(pageDelta ?? 0) <= Math.max(10, Math.round(targetPageCount * 0.1))
            ? "pass"
            : "warn",
      detail:
        targetPageCount == null
          ? "No target page count is available for page-fit comparison."
          : pageDelta === 0
            ? `Estimated interior lands exactly on the ${targetPageCount}-page target.`
            : `Estimated interior is ${Math.abs(pageDelta ?? 0)} pages ${pageDelta! > 0 ? "over" : "under"} the ${targetPageCount}-page target.`,
    },
    {
      name: "Chapter length balance",
      status:
        averageChapterWords === 0
          ? "fail"
          : chapterLengthVariance > 1.9 || shortestChapterWords < Math.round(averageChapterWords * 0.45)
            ? "warn"
            : "pass",
      detail:
        averageChapterWords === 0
          ? "No drafted chapters are available for balance analysis."
          : `Average chapter length is ${averageChapterWords.toLocaleString()} words; shortest is ${shortestChapterWords.toLocaleString()} and longest is ${longestChapterWords.toLocaleString()}.`,
    },
    {
      name: "Running head guidance",
      status: typesettingPlan.runningHeads.trim().length > 0 ? "pass" : "warn",
      detail:
        typesettingPlan.runningHeads.trim().length > 0
          ? `Running head plan is defined: ${typesettingPlan.runningHeads}`
          : "Running head guidance is still missing from the typesetting plan.",
    },
    {
      name: "Signature fit",
      status: estimatedBlankPages <= Math.max(2, Math.round(signaturePageMultiple * 0.15)) ? "pass" : "warn",
      detail:
        estimatedBlankPages === 0
          ? `Estimated interior fits exactly into ${estimatedSignatureCount} ${signaturePageMultiple}-page signature(s).`
          : `Estimated interior leaves ${estimatedBlankPages} blank page(s) inside ${estimatedSignatureCount} ${signaturePageMultiple}-page signature(s).`,
    },
  ];
  const packageStatus =
    editorialRecommendation === "blocked"
      ? "prepared_needs_editorial_revision"
      : preflightChecks.some((check) => check.status === "fail")
        ? "draft"
        : "ready_to_publish";

  return {
    title: assembly.title,
    subtitle: assembly.subtitle ?? null,
    preparedAt: new Date().toISOString(),
    totalWords: assembly.totalWords,
    chapterCount: assembly.chapterCount,
    trimSize,
    targetPageCount: bookSetup?.targetPageCount ?? null,
    outputFormats,
    exportFormats: ["docx", "html", "markdown", "json"],
    frontMatter,
    backMatter,
    packageComponents: [
      "Manuscript assembly",
      "Publishing notes",
      "Format export set",
      "Front matter plan",
      "Back matter plan",
      "Typesetting plan",
      "Preflight report",
    ],
    exportProfiles: [
      {
        format: "PRINT",
        status: outputFormats.includes("PRINT") ? "ready" : "not_requested",
        notes: [
          `Interior prepared for ${trimSize} trim assumptions.`,
          "Final print layout should confirm page breaks, running heads, and chapter opener spacing.",
        ],
      },
      {
        format: "EBOOK",
        status: outputFormats.includes("EBOOK") ? "ready" : "not_requested",
        notes: [
          "HTML and Markdown exports can feed ebook conversion.",
          "Final ebook QA should verify linked TOC, device spacing, and heading hierarchy.",
        ],
      },
      {
        format: "AUDIO",
        status: outputFormats.includes("AUDIO") ? "ready" : "not_requested",
        notes: [
          "Narration prep should remove purely visual cues and confirm pronunciation notes.",
        ],
      },
    ],
    draftQualitySummary: draftQualityRollup
      ? {
          averageScore: draftQualityRollup.averageScore,
          chaptersNeedingRevision: draftQualityRollup.chaptersNeedingRevision,
          strongChapters: draftQualityRollup.strongChapters,
          watchChapters: draftQualityRollup.watchChapters,
          attentionChapters: draftQualityRollup.attentionChapters,
          totalRevisionPasses: draftQualityRollup.totalRevisionPasses,
          weakestChapterLabel: draftQualityRollup.weakestChapterLabel,
          headline: draftQualityRollup.headline,
          blockers: draftQualityRollup.blockers,
        }
      : null,
    typesettingPlan,
    preflightChecks,
    notes: [
      "The manuscript is assembled and export-ready from the Editing stage.",
      "A true final typesetting pass may still adjust pagination and front/back matter.",
      ...(draftQualityRollup
        ? [`Draft quality headline: ${draftQualityRollup.headline}`]
        : []),
    ],
    packageStatus,
  };
}

export function buildProvenanceReport(params: {
  workflowType: BookWorkflowType;
  bookTitle: string;
  publishingPackage: PublishingPackage;
  editorialPreferences: EditorialPreferenceProfile;
  revisionPlanExecution: EditorialRevisionPlanExecution | null;
}) {
  const {
    workflowType,
    bookTitle,
    publishingPackage,
    editorialPreferences,
    revisionPlanExecution,
  } = params;

  const artifactTrail: ProvenanceReport["artifactTrail"] =
    workflowType === BookWorkflowType.FICTION
      ? [
          { stage: "Story Setup", status: "committed", source: "Fiction planning workflow" },
          { stage: "Story Core", status: "committed", source: "Fiction story-engine workflow" },
          { stage: "World & Cast", status: "committed", source: "Story memory / cast bible" },
          { stage: "Plot Blueprint", status: "committed", source: "Chapter-based story structure" },
          { stage: "Scene Plan", status: "committed", source: "Scene sequencing and continuity planning" },
          { stage: "Draft", status: "committed", source: "Generated chapter prose from scene plan" },
          { stage: "Editing", status: "committed", source: "Editorial loop and publishing package" },
        ]
      : [
          { stage: "Promise", status: "committed", source: "Strategic book foundation and positioning" },
          { stage: "Outline", status: "committed", source: "Section, chapter, and paragraph structure" },
          { stage: "Base Story", status: "committed", source: "Book-wide narrative spine" },
          { stage: "Research", status: "committed", source: "Verified research dossiers" },
          { stage: "External Stories", status: "committed", source: "Case studies and external examples" },
          { stage: "Personal Stories", status: "committed", source: "Author-sourced lived experience" },
          { stage: "Chapter Draft", status: "committed", source: "Chapter synthesis from all prior artifacts" },
          { stage: "Editing", status: "committed", source: "Editorial loop and publishing package" },
        ];

  const editorialActions: ProvenanceReport["editorialActions"] = [
    {
      kind: "editor-memory",
      detail: `Accepted revisions: ${editorialPreferences.acceptedRevisionCount}; rejected revisions: ${editorialPreferences.rejectedRevisionCount}.`,
    },
    {
      kind: "style-preferences",
      detail: editorialPreferences.styleNotes || "No custom style notes saved.",
    },
  ];

  if (revisionPlanExecution) {
    editorialActions.push({
      kind: "autonomous-revision-plan",
      detail: `Executed ${revisionPlanExecution.generatedCount} planned revision item(s); auto-applied ${revisionPlanExecution.autoAppliedCount}.`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    workflowType,
    title: bookTitle,
    artifactTrail,
    editorialActions,
    packageReadiness: {
      packageStatus: publishingPackage.packageStatus,
      totalWords: publishingPackage.totalWords,
      chapterCount: publishingPackage.chapterCount,
    },
    notes: [
      "This provenance report summarizes the artifact chain that produced the final manuscript package.",
      "Use it as a handoff note for internal review, publisher conversations, or AI-authorship traceability.",
    ],
  } satisfies ProvenanceReport;
}

export function buildMarketingHandoffPackage(params: {
  workflowType: BookWorkflowType;
  assembly: ManuscriptAssembly;
  publishingPackage: PublishingPackage;
}) {
  const { workflowType, assembly, publishingPackage } = params;

  const synopsis =
    workflowType === BookWorkflowType.FICTION
      ? `A ${assembly.chapterCount}-chapter narrative about what it costs to tell the truth when comfort, loyalty, and inherited systems all push in the opposite direction.`
      : `A ${assembly.chapterCount}-chapter leadership manuscript that helps readers move from reactive compensation toward structural influence grounded in trust, alignment, and accountability.`;

  return {
    generatedAt: new Date().toISOString(),
    title: assembly.title,
    subtitle: assembly.subtitle ?? null,
    audience:
      workflowType === BookWorkflowType.FICTION
        ? ["Readers of character-driven suspense", "Book clubs", "Readers who enjoy family-system intrigue"]
        : ["Leaders in growth-stage companies", "Operators scaling teams", "Readers of practical leadership frameworks"],
    positioning:
      workflowType === BookWorkflowType.FICTION
        ? ["Planning-first fiction workflow output", "Scene-driven suspense with emotional systems pressure"]
        : ["Systems-first leadership book", "Practical trust and alignment operating model"],
    hooks:
      workflowType === BookWorkflowType.FICTION
        ? [
            "A family inheritance becomes the doorway into a conspiracy.",
            "Every chapter tightens the cost of truth versus comfort.",
          ]
        : [
            "Most leadership exhaustion is a system smell, not a personal failure.",
            "Influence is something leaders build, not perform.",
          ],
    synopsis,
    exportReadiness: [
      `Package status: ${publishingPackage.packageStatus}`,
      `Available formats: ${publishingPackage.exportFormats.join(", ")}`,
      `Trim size: ${publishingPackage.trimSize}`,
    ],
  } satisfies MarketingHandoffPackage;
}
