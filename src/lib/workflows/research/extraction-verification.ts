import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ResearchVerificationStatus } from "@prisma/client";
import { z } from "zod";

import { getModelForRole, resolveModelSpec, type StageRole } from "../../llm/routing";
import type { ResearchLens } from "../../research-lenses";
import type {
  ChapterResearchItem,
  ChapterResearchVerification,
  ResearchItemType,
} from "../../research-types";
import type { ChapterContext } from "./execution-setup";
import type { FetchedSource } from "./source-discovery";
import { getMessageTextContent } from "./source-utils";

type ResearchModelPurpose = "questions" | "extraction" | "verification" | "adjudication";
type ResearchReasoningEffort = "minimal" | "low" | "medium" | "high";

type ChatMessage = SystemMessage | HumanMessage;

type ChatModel = {
  withStructuredOutput: <TSchema extends z.ZodTypeAny>(
    schema: TSchema,
  ) => {
    invoke: (messages: ChatMessage[]) => Promise<z.infer<TSchema>>;
  };
  invoke: (messages: ChatMessage[]) => Promise<{ content: unknown }>;
};

type ResearchModelProvider = (purpose: ResearchModelPurpose) => Promise<ChatModel | null>;
type PassagePrefilterModelProvider = () => Promise<ChatModel | null>;

type ModelOptions = {
  getModel?: ResearchModelProvider;
  getPassagePrefilterModel?: PassagePrefilterModelProvider;
};

const ExtractedItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      itemType: z.enum([
        "FACT",
        "STATISTIC",
        "QUOTE",
        "EXAMPLE",
        "CASE_STUDY",
        "COUNTERPOINT",
        "DEFINITION",
      ]),
      claimText: z.string(),
      evidenceExcerpt: z.string().nullable().optional(),
      summary: z.string().nullable().optional(),
      mappedParagraphId: z.string().nullable().optional(),
      confidenceScore: z.number().min(0).max(1).nullable().optional(),
      relevanceScore: z.number().min(0).max(1).nullable().optional(),
    }),
  ),
});

const VerificationSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      status: z.enum(["VERIFIED", "REJECTED", "NEEDS_CORROBORATION"]),
      claimSupported: z.boolean(),
      tierConfirmed: z.boolean(),
      secondSourceRequired: z.boolean(),
      secondSourceConfirmed: z.boolean(),
      notes: z.string(),
    }),
  ),
});

const AdjudicationSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      status: z.enum(["VERIFIED", "REJECTED", "NEEDS_CORROBORATION"]),
      notes: z.string(),
      secondSourceRequired: z.boolean(),
    }),
  ),
});

const PassagePrefilterSchema = z.object({
  passages: z.array(z.string()),
});

const PASSAGE_PREFILTER_PROMPT = `You are a fast, literal passage-selector preparing a web page for a careful fact-extraction pass on one book chapter.

Given the chapter's research needs and the page's full text, select and return the passages most likely to contain: statistics or data points, named facts or dates, direct quotes, concrete examples or case studies, and explanations of mechanism or origin relevant to the chapter.

Rules:
- Copy each passage VERBATIM from the source text — do not summarize, paraphrase, or rewrite anything.
- Include a sentence of surrounding context before and after each passage so it can be understood on its own.
- Err on the side of including a passage when unsure — a later, more careful pass will judge relevance and accuracy in detail. Losing a real fact here is worse than including one extra passage.
- Return passages in the order they appear in the source.
- Do not invent, infer, or add anything that is not literally present in the source text.
- If the page has little or nothing relevant to the chapter, return fewer passages rather than padding with unrelated text.`;

const PASSAGE_PREFILTER_CAP = 30000;

const EXTRACTION_SYSTEM_PROMPT = `You are the senior research extractor for a nonfiction book chapter. You are not a summarizer; you are building a dossier that the author will cite by field.

Read the full source text and extract EVERY item that could strengthen the chapter, under these rules:

1. DEPTH OVER BREVITY.
   - Every claim gets the full context that makes it credible: the study's N, the time period, the sample, who funded it.
   - For statistics: capture the number, the denominator, the year, and the measurement definition.
   - For examples: capture the named entity, the setting, what actually happened, and the observable outcome.
   - For quotes: capture the speaker's role, the context, and the verbatim line.

2. FAITHFUL BUT RIGOROUS.
   - Never invent. If a detail isn't in the source, leave it null.
   - Preserve nuance: if the source says "up to 30%" do not write "30%".
   - If the source contradicts a common framing, capture the contradiction as a COUNTERPOINT.

3. FILL THE EVIDENCE EXCERPT.
   - Every item must include an evidenceExcerpt that quotes or tightly paraphrases the source line this claim rests on. This is non-optional. Without the excerpt the claim cannot be verified downstream.

4. MAP TO PARAGRAPHS.
   - Look at the chapter paragraph outline in the input. Map each item to the most relevant paragraph id. This is how the claim gets placed in the draft.

5. SCORE HONESTLY.
   - relevanceScore: how directly this serves the chapter's thesis (0.0–1.0). Be honest. A 0.5 item is still useful but shouldn't pass as 0.9.
   - confidenceScore: how confident you are this is accurately extracted from the source (0.0–1.0). Penalize weak framing, vague numbers, or second-hand citations.

6. NO CONSULTANT NOISE.
   - No "in today's fast-paced world". No "at the end of the day". No "as the saying goes". No rhetorical padding. The author will throw those out anyway.

7. EXTRACT WIDELY.
   - Err on the side of capturing more candidate items. The verifier will cull. Shallow extraction is the failure mode — do not produce 2 items when the source supports 12.

Return every legitimate item the source supports.`;

const VERIFICATION_SYSTEM_PROMPT = `You are the second-pass verifier for a chapter research dossier.

Your job is to independently verify each candidate item against the fetched source text.

Rules:
- REJECT any claim whose evidenceExcerpt is not actually supported by the source text.
- REJECT distortions: a source saying "up to 30%" does not support a claim of "30%".
- REJECT missing context: a statistic without denominator or time period is not verified.
- NEEDS_CORROBORATION for claims that look true but depend on a single weak citation, or where the source quotes a second party uncritically.
- VERIFIED only when the source text directly and unambiguously supports the claim.
- Confirm whether the source tier still looks correct based on publisher reputation and evidence type.
- Be strict. A false positive poisons the draft; a false negative just means more research.`;

const FOCUSED_CONTEXT_WINDOW = 400;
const FOCUSED_CONTEXT_CAP = 20000;

function getResearchReasoningEffort(purpose: ResearchModelPurpose): ResearchReasoningEffort {
  if (purpose === "questions") {
    return (process.env.OPENAI_RESEARCH_QUESTION_REASONING ??
      "low") as ResearchReasoningEffort;
  }

  if (purpose === "verification") {
    return (process.env.OPENAI_RESEARCH_VERIFICATION_REASONING ??
      "high") as ResearchReasoningEffort;
  }

  if (purpose === "adjudication") {
    return (process.env.OPENAI_RESEARCH_ADJUDICATION_REASONING ??
      "high") as ResearchReasoningEffort;
  }

  return (process.env.OPENAI_RESEARCH_EXTRACTION_REASONING ??
    "high") as ResearchReasoningEffort;
}

function roleForPurpose(purpose: ResearchModelPurpose): StageRole {
  if (purpose === "questions") return "research:questions";
  if (purpose === "verification") return "research:agent-3-verifier";
  if (purpose === "adjudication") return "research:adjudicate";
  return "research:extract";
}

async function getChatModel(purpose: ResearchModelPurpose) {
  const timeoutMs =
    purpose === "adjudication" ? 120000 : purpose === "extraction" ? 120000 : 60000;
  const reasoningEffort = getResearchReasoningEffort(purpose);
  const normalizedEffort =
    reasoningEffort === "minimal"
      ? "low"
      : ((reasoningEffort === "low" || reasoningEffort === "medium" || reasoningEffort === "high")
          ? reasoningEffort
          : "high");

  return getModelForRole(roleForPurpose(purpose), {
    temperature: purpose === "verification" ? 0.1 : 0.4,
    maxOutputTokens: 8000,
    timeoutMs,
    reasoningEffort: normalizedEffort,
  }) as Promise<ChatModel | null>;
}

async function getPassagePrefilterModel() {
  return getModelForRole("research:agent-2-extractor", {
    temperature: 0.1,
    maxOutputTokens: 8000,
    timeoutMs: 60000,
  }) as Promise<ChatModel | null>;
}

function parseJsonText<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function enhancePromptWithQualityFeedback(
  basePrompt: string,
  qualityFeedback?: unknown,
): string {
  if (!qualityFeedback || typeof qualityFeedback !== "object") {
    return basePrompt;
  }

  const feedback = qualityFeedback as Record<string, unknown>;
  const guidance = feedback.guidance ? String(feedback.guidance) : null;
  const issues = Array.isArray(feedback.issues) ? feedback.issues : [];

  if (!guidance && issues.length === 0) {
    return basePrompt;
  }

  const feedbackText = `

QUALITY FEEDBACK FROM PREVIOUS ATTEMPT:
${guidance ? `Priority: ${guidance}` : ""}
${issues.length > 0 ? `Issues to fix:\n${issues.map((issue) => `- ${issue}`).join("\n")}` : ""}`;

  return basePrompt + feedbackText;
}

async function prefilterRelevantPassages(
  chapter: ChapterContext,
  source: FetchedSource,
  providePassagePrefilterModel: PassagePrefilterModelProvider,
): Promise<string> {
  const fullText = source.text.slice(0, 180000);
  if (fullText.length <= PASSAGE_PREFILTER_CAP) {
    return fullText;
  }

  const model = await providePassagePrefilterModel();
  if (!model) {
    return fullText;
  }

  try {
    const structuredModel = model.withStructuredOutput(PassagePrefilterSchema);
    const result = await structuredModel.invoke([
      new SystemMessage(PASSAGE_PREFILTER_PROMPT),
      new HumanMessage(
        JSON.stringify({
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          sourceText: fullText,
        }),
      ),
    ]);

    const passages = result.passages.map((passage) => passage.trim()).filter(Boolean);
    if (passages.length === 0) {
      return fullText;
    }

    return passages.join("\n...\n").slice(0, PASSAGE_PREFILTER_CAP);
  } catch (error) {
    console.warn(
      `[research] passage prefilter failed for source ${source.id} (${source.title}), falling back to full page:`,
      error instanceof Error ? error.message : error,
    );
    return fullText;
  }
}

export function buildFocusedSourceContext(
  sourceText: string,
  excerpts: Array<string | null | undefined>,
): string {
  const windows: string[] = [];
  const seenRanges: Array<[number, number]> = [];

  for (const excerpt of excerpts) {
    const needle = (excerpt ?? "").trim().slice(0, 200);
    if (needle.length < 12) continue;

    const at = sourceText.indexOf(needle);
    if (at === -1) continue;

    const start = Math.max(0, at - FOCUSED_CONTEXT_WINDOW);
    const end = Math.min(sourceText.length, at + needle.length + FOCUSED_CONTEXT_WINDOW);
    if (seenRanges.some(([s, e]) => start < e && end > s)) continue;
    seenRanges.push([start, end]);
    windows.push(sourceText.slice(start, end));
  }

  if (windows.length === 0) {
    return sourceText.slice(0, FOCUSED_CONTEXT_CAP);
  }

  return windows.join("\n...\n").slice(0, FOCUSED_CONTEXT_CAP);
}

export function shouldAutoPromoteResearchItem(
  item: ChapterResearchItem,
  source: FetchedSource,
  verification?: {
    status?: ResearchVerificationStatus;
    claimSupported?: boolean;
    tierConfirmed?: boolean;
    secondSourceRequired?: boolean;
    secondSourceConfirmed?: boolean;
  },
) {
  if (!verification) {
    return false;
  }

  if (verification.status === "VERIFIED") {
    return true;
  }

  if (verification.status === "REJECTED") {
    return false;
  }

  if (!verification.claimSupported || !verification.tierConfirmed) {
    return false;
  }

  if (verification.secondSourceConfirmed) {
    return true;
  }

  const promotableTierBTypes = [
    "FACT",
    "DEFINITION",
    "EXAMPLE",
    "CASE_STUDY",
    "COUNTERPOINT",
  ];

  if (source.sourceTier === "A") {
    return item.itemType !== "QUOTE";
  }

  if (source.sourceTier !== "B") {
    return false;
  }

  return promotableTierBTypes.includes(item.itemType);
}

export async function extractItemsFromSource(
  chapter: ChapterContext,
  source: FetchedSource,
  lens: ResearchLens,
  qualityFeedback?: unknown,
  options: ModelOptions = {},
): Promise<ChapterResearchItem[]> {
  const model = await (options.getModel ?? getChatModel)("extraction");

  const fallbackSourceChunks = source.text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.trim().length > 80)
    .slice(0, Math.max(3, Math.min(6, chapter.paragraphs.length || 3)));

  const fallback: ChapterResearchItem[] = fallbackSourceChunks.map((sentence, index) => {
    const paragraph = chapter.paragraphs[index % Math.max(1, chapter.paragraphs.length)];
    const itemType: ResearchItemType =
      /\d/.test(sentence) ? "STATISTIC" : index === 0 ? "FACT" : "EXAMPLE";

    return {
      id: `${source.id}-item-${index + 1}`,
      itemType,
      claimText: sentence.trim().slice(0, 600),
      evidenceExcerpt: sentence.trim().slice(0, 320),
      summary: `Candidate support drawn from ${source.publisher ?? source.title}.`,
      sourceId: source.id,
      sourceTier: source.sourceTier,
      tierWeight: source.tierWeight,
      verificationStatus: "PENDING",
      relevanceScore: 0.62,
      confidenceScore: 0.52,
      mappedSectionId: chapter.sectionId ?? null,
      mappedChapterId: chapter.chapterKey,
      mappedParagraphId: paragraph?.paragraphId ?? null,
      metadata: {},
    };
  });

  if (!model) {
    return fallback;
  }

  try {
    const structuredModel = model.withStructuredOutput(ExtractedItemsSchema);
    const lensAwarePrompt = [EXTRACTION_SYSTEM_PROMPT, lens.tierRules, lens.directives]
      .filter(Boolean)
      .join("\n\n");
    const enhancedPrompt = enhancePromptWithQualityFeedback(lensAwarePrompt, qualityFeedback);
    const focusedSourceText = await prefilterRelevantPassages(
      chapter,
      source,
      options.getPassagePrefilterModel ?? getPassagePrefilterModel,
    );
    const result = await structuredModel.invoke([
      new SystemMessage(enhancedPrompt),
      new HumanMessage(
        JSON.stringify({
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          chapterParagraphs: chapter.paragraphs,
          source: {
            title: source.title,
            url: source.canonicalUrl ?? source.url,
            publisher: source.publisher,
            sourceTier: source.sourceTier,
            text: focusedSourceText,
          },
        }),
      ),
    ]);

    if (result.items.length === 0) {
      console.warn(
        `[research] extraction returned zero items for source ${source.id} (${source.title}). Using sentence-split provisional.`,
      );
      return fallback.map((item) => ({
        ...item,
        metadata: { ...(item.metadata ?? {}), provisional: true, reason: "extraction-empty" },
      }));
    }

    return result.items.map((item, index) => ({
      id: item.id || `${source.id}-item-${index + 1}`,
      itemType: item.itemType as ResearchItemType,
      claimText: item.claimText,
      evidenceExcerpt: item.evidenceExcerpt ?? null,
      summary: item.summary ?? null,
      sourceId: source.id,
      sourceTier: source.sourceTier,
      tierWeight: source.tierWeight,
      verificationStatus: "PENDING",
      relevanceScore: item.relevanceScore ?? 0.65,
      confidenceScore: item.confidenceScore ?? 0.6,
      mappedSectionId: chapter.sectionId ?? null,
      mappedChapterId: chapter.chapterKey,
      mappedParagraphId: item.mappedParagraphId ?? chapter.paragraphs[0]?.paragraphId ?? null,
      metadata: {},
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown extraction error";
    console.error(
      `[research] extraction threw for source ${source.id} (${source.title}): ${message}`,
    );
    return fallback.map((item) => ({
      ...item,
      metadata: {
        ...(item.metadata ?? {}),
        provisional: true,
        reason: "extraction-failed",
        error: message,
      },
    }));
  }
}

export async function verifyItemsForSource(
  chapter: ChapterContext,
  source: FetchedSource,
  items: ChapterResearchItem[],
  lens: ResearchLens,
  qualityFeedback?: unknown,
  options: ModelOptions = {},
): Promise<{
  items: ChapterResearchItem[];
  verifications: ChapterResearchVerification[];
}> {
  const model = await (options.getModel ?? getChatModel)("verification");
  const lensAwareVerificationPrompt = lens.tierRules
    ? `${VERIFICATION_SYSTEM_PROMPT}\n\n${lens.tierRules}`
    : VERIFICATION_SYSTEM_PROMPT;
  const enhancedVerificationPrompt = enhancePromptWithQualityFeedback(
    lensAwareVerificationPrompt,
    qualityFeedback,
  );

  if (!model) {
    return {
      items,
      verifications: items.map((item) => ({
        id: `${item.id}-llm-verify`,
        sourceRecordId: source.id,
        researchItemId: item.id,
        verifierType: "LLM_VERIFIER",
        status: "NEEDS_CORROBORATION",
        titleMatch: null,
        contentMatch: null,
        claimSupported: true,
        tierConfirmed: true,
        secondSourceRequired: source.sourceTier !== "A",
        secondSourceConfirmed: false,
        notes: "Fallback verification marked this item as needing corroboration.",
        metadata: {},
      })),
    };
  }

  try {
    const structuredModel = model.withStructuredOutput(VerificationSchema);
    const result = await structuredModel.invoke([
      new SystemMessage(enhancedVerificationPrompt),
      new HumanMessage(
        JSON.stringify({
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          source: {
            title: source.title,
            url: source.canonicalUrl ?? source.url,
            sourceTier: source.sourceTier,
            text: buildFocusedSourceContext(
              source.text,
              items.map((item) => item.evidenceExcerpt ?? item.claimText),
            ),
          },
          candidateItems: items.map((item) => ({
            itemId: item.id,
            claimText: item.claimText,
            evidenceExcerpt: item.evidenceExcerpt,
            itemType: item.itemType,
          })),
        }),
      ),
    ]);

    const verificationById = new Map(result.items.map((item) => [item.itemId, item]));
    const nextItems = items.map((item) => {
      const verification = verificationById.get(item.id);
      const promoted = shouldAutoPromoteResearchItem(item, source, verification);
      return {
        ...item,
        verificationStatus: promoted
          ? "VERIFIED"
          : ((verification?.status as ResearchVerificationStatus) ?? "REJECTED"),
      };
    });

    const verifications: ChapterResearchVerification[] = nextItems.map((item) => {
      const verification = verificationById.get(item.id);

      return {
        id: `${item.id}-llm-verify`,
        sourceRecordId: source.id,
        researchItemId: item.id,
        verifierType: "LLM_VERIFIER",
        status: shouldAutoPromoteResearchItem(item, source, verification)
          ? "VERIFIED"
          : ((verification?.status as ResearchVerificationStatus) ?? "REJECTED"),
        titleMatch: null,
        contentMatch: null,
        claimSupported: verification?.claimSupported ?? false,
        tierConfirmed: verification?.tierConfirmed ?? false,
        secondSourceRequired: verification?.secondSourceRequired ?? false,
        secondSourceConfirmed: verification?.secondSourceConfirmed ?? false,
        notes: verification?.notes ?? "Verification failed.",
        metadata: {},
      };
    });

    return { items: nextItems, verifications };
  } catch {
    return {
      items: items.map((item) => ({
        ...item,
        verificationStatus: "NEEDS_CORROBORATION",
      })),
      verifications: items.map((item) => ({
        id: `${item.id}-llm-verify`,
        sourceRecordId: source.id,
        researchItemId: item.id,
        verifierType: "LLM_VERIFIER",
        status: "NEEDS_CORROBORATION",
        titleMatch: null,
        contentMatch: null,
        claimSupported: true,
        tierConfirmed: true,
        secondSourceRequired: true,
        secondSourceConfirmed: false,
        notes: "Verification fallback marked this item as needing corroboration.",
        metadata: {},
      })),
    };
  }
}

export async function adjudicateAmbiguousItems(
  chapter: ChapterContext,
  source: FetchedSource,
  items: ChapterResearchItem[],
  verifications: ChapterResearchVerification[],
  lens: ResearchLens,
  options: ModelOptions = {},
) {
  const model = await (options.getModel ?? getChatModel)("adjudication");
  if (!model) {
    return { items, verifications };
  }

  const ambiguousItems = items.filter((item) => item.verificationStatus === "NEEDS_CORROBORATION");
  if (ambiguousItems.length === 0) {
    return { items, verifications };
  }

  try {
    const response = await model.invoke([
      new SystemMessage(`
You are the final adjudicator for ambiguous research-verification decisions.

Return strict JSON with this shape:
{
  "items": [
    {
      "itemId": "string",
      "status": "VERIFIED" | "REJECTED" | "NEEDS_CORROBORATION",
      "notes": "string",
      "secondSourceRequired": true | false
    }
  ]
}

Rules:
- Be conservative.
- Only upgrade to VERIFIED if the source text clearly supports the claim.
- Use NEEDS_CORROBORATION when the claim seems plausible but too important or too soft to accept alone.
- Use REJECTED when the claim is not supported or is distorted.
      ${lens.tierRules ? `\n${lens.tierRules}\n` : ""}`),
      new HumanMessage(
        JSON.stringify({
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          source: {
            title: source.title,
            url: source.canonicalUrl ?? source.url,
            sourceTier: source.sourceTier,
          },
          candidateItems: ambiguousItems.map((item) => ({
            id: item.id,
            claimText: item.claimText,
            evidenceExcerpt: item.evidenceExcerpt,
            currentStatus: item.verificationStatus,
          })),
          sourceText: buildFocusedSourceContext(
            source.text,
            ambiguousItems.map((item) => item.evidenceExcerpt ?? item.claimText),
          ),
        }),
      ),
    ]);

    const result = AdjudicationSchema.safeParse(
      parseJsonText(getMessageTextContent(response.content), { items: [] }),
    );

    if (!result.success) {
      return { items, verifications };
    }

    const adjudicationById = new Map(result.data.items.map((item) => [item.itemId, item]));

    return {
      items: items.map((item) => {
        const adjudication = adjudicationById.get(item.id);
        if (!adjudication) {
          return item;
        }

        const promoted = shouldAutoPromoteResearchItem(item, source, {
          status: adjudication.status as ResearchVerificationStatus,
          claimSupported: adjudication.status !== "REJECTED",
          tierConfirmed: true,
          secondSourceRequired: adjudication.secondSourceRequired,
          secondSourceConfirmed: false,
        });

        return {
          ...item,
          verificationStatus: promoted
            ? "VERIFIED"
            : (adjudication.status as ResearchVerificationStatus),
        };
      }),
      verifications: [
        ...verifications,
        ...result.data.items.map((item) => {
          const originalItem = items.find((candidate) => candidate.id === item.itemId);
          const promoted =
            originalItem != null
              ? shouldAutoPromoteResearchItem(originalItem, source, {
                  status: item.status as ResearchVerificationStatus,
                  claimSupported: item.status !== "REJECTED",
                  tierConfirmed: true,
                  secondSourceRequired: item.secondSourceRequired,
                  secondSourceConfirmed: false,
                })
              : false;

          return {
            id: `${item.itemId}-pro-adjudication`,
            sourceRecordId: source.id,
            researchItemId: item.itemId,
            verifierType: "LLM_VERIFIER" as const,
            status: promoted
              ? "VERIFIED"
              : (item.status as ResearchVerificationStatus),
            titleMatch: null,
            contentMatch: null,
            claimSupported: item.status !== "REJECTED",
            tierConfirmed: true,
            secondSourceRequired: item.secondSourceRequired,
            secondSourceConfirmed: false,
            notes: `Adjudication review: ${item.notes}`,
            metadata: {
              adjudicationModel: resolveModelSpec("research:adjudicate"),
            },
          };
        }),
      ],
    };
  } catch {
    return { items, verifications };
  }
}
