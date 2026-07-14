import { resolveModelSpec } from "../../llm/routing";
import { createResearchPackVersion } from "../../repositories/research-artifacts";
import type {
  ChapterResearchDossier,
  ChapterResearchItem,
  ChapterResearchSource,
  ChapterResearchVerification,
} from "../../research-types";
import type { ChapterContext } from "./execution-setup";

export function getResearchDossierModelName() {
  return `questions:${resolveModelSpec("research:questions")}; extraction:${resolveModelSpec("research:extract")}; verification:${resolveModelSpec("research:verify")}; adjudication:${resolveModelSpec("research:adjudicate")}`;
}

export async function persistChapterResearchDossier(input: {
  bookId: string;
  chapter: ChapterContext;
  dossier: ChapterResearchDossier;
  sources: ChapterResearchSource[];
  items: ChapterResearchItem[];
  verifications: ChapterResearchVerification[];
}) {
  return createResearchPackVersion({
    bookId: input.bookId,
    chapterKey: input.chapter.chapterKey,
    chapterTitle: input.chapter.chapterTitle,
    summary: input.dossier.researchGoal,
    dossier: input.dossier,
    sources: input.sources,
    items: input.items,
    verifications: input.verifications,
    modelName: getResearchDossierModelName(),
    promptTemplateVersion: "research-v2-depth",
  });
}
