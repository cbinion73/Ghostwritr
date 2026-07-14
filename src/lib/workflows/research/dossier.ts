import type {
  ChapterResearchDossier,
  ChapterResearchItem,
  ChapterResearchQuestion,
  ChapterResearchSource,
  ResearchItemType,
} from "../../research-types";
import type { ChapterContext } from "./execution-setup";

type TransientFetchedSourceFields = {
  text?: string;
  html?: string;
};

export function buildDossier(
  chapter: ChapterContext,
  questions: ChapterResearchQuestion[],
  sources: ChapterResearchSource[],
  items: ChapterResearchItem[],
): ChapterResearchDossier {
  const verifiedItems = items.filter((item) => item.verificationStatus === "VERIFIED");
  const needsCorroborationItems = items.filter(
    (item) => item.verificationStatus === "NEEDS_CORROBORATION",
  );

  const byType = (itemType: ResearchItemType) =>
    verifiedItems.filter((item) => item.itemType === itemType);

  const examples = verifiedItems.filter((item) =>
    item.itemType === "EXAMPLE" || item.itemType === "CASE_STUDY",
  );

  const verifiedSources = sources.filter((source) => source.isVerified);

  // `sources` can be a transient fetched-source shape carrying full scraped
  // `html` and extracted `text`. Those fields are needed only for extraction,
  // not for persisted dossiers, and can otherwise balloon a chapter record by
  // tens of megabytes.
  const persistedSourceRegister: ChapterResearchSource[] = sources.map((source) => {
    const { text: _text, html: _html, ...persisted } =
      source as ChapterResearchSource & TransientFetchedSourceFields;
    return persisted;
  });

  return {
    chapterKey: chapter.chapterKey,
    chapterTitle: chapter.chapterTitle,
    chapterDescription: chapter.chapterDescription,
    researchGoal: `Build a defensible research dossier for ${chapter.chapterTitle} with independently verified facts, figures, and examples.`,
    researchQuestions: questions,
    factBank: byType("FACT"),
    statistics: byType("STATISTIC"),
    quotes: byType("QUOTE"),
    examples,
    counterpoints: byType("COUNTERPOINT"),
    definitions: byType("DEFINITION"),
    gaps: [
      ...(verifiedItems.length === 0
        ? ["No verified research items were admitted yet for this chapter."]
        : []),
      ...needsCorroborationItems.map(
        (item) => `Needs corroboration before admission: ${item.claimText}`,
      ),
    ],
    sourceRegister: persistedSourceRegister,
    verificationSummary: {
      totalSources: sources.length,
      verifiedSources: verifiedSources.length,
      totalItems: items.length,
      verifiedItems: verifiedItems.length,
      rejectedItems: items.filter((item) => item.verificationStatus === "REJECTED").length,
      needsCorroborationItems: needsCorroborationItems.length,
    },
  };
}
