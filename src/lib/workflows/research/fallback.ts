import type {
  ChapterResearchDossier,
  ChapterResearchItem,
  ChapterResearchQuestion,
  ChapterResearchSource,
  ChapterResearchVerification,
} from "../../research-types";
import type { ChapterContext } from "./execution-setup";

export function buildProvisionalResearchPack(
  chapter: ChapterContext,
  questions: ChapterResearchQuestion[],
  failureMessage: string,
) {
  const timedOut = /timed out/i.test(failureMessage);
  const sourceId = `${chapter.chapterKey}-provisional-source`;
  const provisionalSource: ChapterResearchSource = {
    id: sourceId,
    url: "about:provisional-research-plan",
    title: `Provisional research scaffold for ${chapter.chapterTitle}`,
    publisher: "GHOSTWRITR",
    author: "System fallback",
    accessedAt: new Date().toISOString(),
    contentType: "text/plain",
    sourceTier: "C",
    tierWeight: 0.5,
    isVerified: false,
    verificationStatus: "NEEDS_CORROBORATION",
    verificationNotes:
      "Generated without live web verification. Replace with traced sources before final drafting.",
    metadata: {
      provisional: true,
      retryRecommended: true,
      failureReason: failureMessage,
      timeout: timedOut,
    },
  };

  const provisionalItems: ChapterResearchItem[] = [
    {
      id: `${chapter.chapterKey}-lead-1`,
      itemType: "DEFINITION",
      claimText: `Define the central operating problem in ${chapter.chapterTitle} with a traceable source before drafting.`,
      summary: `Use this as a research lead for ${chapter.chapterDescription}`,
      sourceId,
      sourceTier: "C",
      tierWeight: 0.5,
      verificationStatus: "NEEDS_CORROBORATION",
      mappedChapterId: chapter.chapterKey,
      mappedParagraphId: chapter.paragraphs[0]?.paragraphId ?? null,
      metadata: { provisional: true },
    },
    {
      id: `${chapter.chapterKey}-lead-2`,
      itemType: "STATISTIC",
      claimText: `Find 2-3 current metrics or benchmarks that quantify the operational stakes behind ${chapter.chapterTitle}.`,
      summary: "Research lead only. Do not quote as fact until verified.",
      sourceId,
      sourceTier: "C",
      tierWeight: 0.5,
      verificationStatus: "NEEDS_CORROBORATION",
      mappedChapterId: chapter.chapterKey,
      mappedParagraphId: chapter.paragraphs[1]?.paragraphId ?? chapter.paragraphs[0]?.paragraphId ?? null,
      metadata: { provisional: true },
    },
    {
      id: `${chapter.chapterKey}-lead-3`,
      itemType: "EXAMPLE",
      claimText: `Locate one concrete case study that demonstrates ${chapter.chapterTitle} in practice.`,
      summary: "Use this to anchor the chapter with a real-world example later.",
      sourceId,
      sourceTier: "C",
      tierWeight: 0.5,
      verificationStatus: "NEEDS_CORROBORATION",
      mappedChapterId: chapter.chapterKey,
      mappedParagraphId: chapter.paragraphs[2]?.paragraphId ?? chapter.paragraphs[0]?.paragraphId ?? null,
      metadata: { provisional: true },
    },
  ];

  const provisionalVerifications: ChapterResearchVerification[] = provisionalItems.map((item) => ({
    id: `${item.id}-verify`,
    sourceRecordId: sourceId,
    researchItemId: item.id,
    verifierType: "LLM_VERIFIER",
    status: "NEEDS_CORROBORATION",
    titleMatch: false,
    contentMatch: false,
    claimSupported: false,
    tierConfirmed: false,
    secondSourceRequired: true,
    secondSourceConfirmed: false,
    notes: "Fallback scaffold only. Retry after web access is configured.",
    metadata: { provisional: true },
  }));

  const dossier: ChapterResearchDossier = {
    chapterKey: chapter.chapterKey,
    chapterTitle: chapter.chapterTitle,
    chapterDescription: chapter.chapterDescription,
    researchGoal: `Provisional dossier for ${chapter.chapterTitle}. This chapter still needs verified web research before final drafting.`,
    researchQuestions: questions,
    factBank: [],
    statistics: provisionalItems.filter((item) => item.itemType === "STATISTIC"),
    quotes: [],
    examples: provisionalItems.filter((item) => item.itemType === "EXAMPLE"),
    counterpoints: [],
    definitions: provisionalItems.filter((item) => item.itemType === "DEFINITION"),
    gaps: [
      "This dossier was generated without working web access.",
      "All items below are research leads, not admitted facts.",
      failureMessage,
    ],
    sourceRegister: [provisionalSource],
    verificationSummary: {
      totalSources: 1,
      verifiedSources: 0,
      totalItems: provisionalItems.length,
      verifiedItems: 0,
      rejectedItems: 0,
      needsCorroborationItems: provisionalItems.length,
    },
    metadata: {
      provisional: true,
      retryRecommended: true,
      warning: "Fallback draft only. Retry once live web search is configured.",
      failureReason: failureMessage,
      timeout: timedOut,
    },
  };

  return {
    dossier,
    sources: [provisionalSource],
    items: provisionalItems,
    verifications: provisionalVerifications,
  };
}
