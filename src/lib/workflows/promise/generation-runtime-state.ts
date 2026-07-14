import { Annotation } from "@langchain/langgraph";

import type { BookSetupProfile } from "../../book-setup-types";
import { DEFAULT_BOOK_SETUP_PROFILE } from "../../book-setup-types";
import type {
  MarketReport,
  PersonaPack,
  PositioningRecommendations,
  PromiseBrief,
  PromiseMessage,
  PromiseScorecard,
} from "../../promise-types";

export type PromiseWorkflowState = {
  bookSlug: string;
  userInput: string;
  bookId?: string;
  stageId?: string;
  bookSetupProfile?: BookSetupProfile | null;
  referenceMaterials?: Array<{
    id: string;
    title: string;
    mimeType: string;
    note: string;
  }>;
  conversationMessages: PromiseMessage[];
  assistantReply?: string;
  extractedPromise?: PromiseBrief;
  scorecard?: PromiseScorecard;
  personaPack?: PersonaPack;
  marketReport?: MarketReport;
  recommendations?: PositioningRecommendations;
};

export const WorkflowState = Annotation.Root({
  bookSlug: Annotation<string>,
  userInput: Annotation<string>,
  bookId: Annotation<string | undefined>,
  stageId: Annotation<string | undefined>,
  bookSetupProfile: Annotation<BookSetupProfile | null | undefined>,
  referenceMaterials: Annotation<
    Array<{
      id: string;
      title: string;
      mimeType: string;
      note: string;
    }>
  >({
    reducer: (_, value) => value,
    default: () => [],
  }),
  conversationMessages: Annotation<PromiseMessage[]>({
    reducer: (_, value) => value,
    default: () => [],
  }),
  assistantReply: Annotation<string | undefined>,
  extractedPromise: Annotation<PromiseBrief | undefined>,
  scorecard: Annotation<PromiseScorecard | undefined>,
  personaPack: Annotation<PersonaPack | undefined>,
  marketReport: Annotation<MarketReport | undefined>,
  recommendations: Annotation<PositioningRecommendations | undefined>,
});

export function parseArtifactJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

/**
 * Committed BOOK_SETUP_PROFILE artifacts come in two shapes: the structured
 * profile (settings form / seeded default) and a markdown {text} blob
 * (Blueprint chat commits). Blind-casting the blob crashed every downstream
 * field access — shallow-merging over defaults gives all consumers the full
 * profile shape either way, and also backfills fields added after older
 * profiles were saved.
 */
export function normalizeBookSetupProfile(value: unknown): BookSetupProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return { ...DEFAULT_BOOK_SETUP_PROFILE, ...(value as Partial<BookSetupProfile>) };
}
