import {
  Prisma,
  ResearchItemType,
  ResearchSourceTier,
  StorySourceTier,
  ExternalStoryType,
  ExternalStoryFit,
  StageKey,
} from "@prisma/client";
import { z } from "zod";

import { db } from "../db";
import { getModelForRole } from "../llm/routing";
import { parseJsonFromText } from "../json-utils";
import { stripNullChars } from "../sanitize";

/**
 * Structured extraction — turns the markdown dossiers the conversational
 * agents produce (Scout research packs, Chronicle story packs) into rows in
 * the structured ResearchItem/ResearchSource and ExternalStoryItem/
 * ExternalStorySource tables.
 *
 * This is the bridge between "readable dossier text" (what the author sees
 * and approves) and "queryable knowledge" (what citation-tracing and the
 * per-chapter linked-notes brain need). It runs as a background pass after
 * a dossier is saved — extraction failure never blocks the save; the text
 * blob remains the source of truth for display.
 */

const TIER_WEIGHT: Record<string, number> = { A: 1.0, B: 0.7, C: 0.4 };

/** Coerce whatever label the extraction model produced onto a fixed vocabulary. */
function normalizeEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  synonyms: Record<string, T>,
  fallback: T,
): T {
  const raw = String(value ?? "")
    .toUpperCase()
    .replace(/[\s-]+/g, "_")
    .trim();
  if ((allowed as readonly string[]).includes(raw)) return raw as T;
  if (synonyms[raw]) return synonyms[raw];
  // Substring match: "KEY_STATISTIC" → STATISTIC, "CASE STUDY EXAMPLE" → CASE_STUDY
  const hit = allowed.find((option) => raw.includes(option));
  return hit ?? fallback;
}

const RESEARCH_ITEM_TYPES = [
  "FACT",
  "STATISTIC",
  "QUOTE",
  "EXAMPLE",
  "CASE_STUDY",
  "COUNTERPOINT",
  "DEFINITION",
] as const;
const RESEARCH_ITEM_SYNONYMS: Record<string, (typeof RESEARCH_ITEM_TYPES)[number]> = {
  STAT: "STATISTIC",
  DATA: "STATISTIC",
  DATA_POINT: "STATISTIC",
  NUMBER: "STATISTIC",
  CLAIM: "FACT",
  FINDING: "FACT",
  RESEARCH_FINDING: "FACT",
  INSIGHT: "FACT",
  FRAMEWORK: "DEFINITION",
  CONCEPT: "DEFINITION",
  TERM: "DEFINITION",
  STORY: "EXAMPLE",
  ANECDOTE: "EXAMPLE",
  CASE: "CASE_STUDY",
  OBJECTION: "COUNTERPOINT",
  CRITIQUE: "COUNTERPOINT",
  CITATION: "QUOTE",
};

const STORY_TYPES = [
  "ORIGIN",
  "TURNING_POINT",
  "FAILURE",
  "RECOVERY",
  "DECISION_UNDER_PRESSURE",
  "INNOVATION",
  "CULTURE",
  "CREDIBILITY",
] as const;
const STORY_FITS = [
  "OPENING_HOOK",
  "CHAPTER_PIVOT",
  "PROOF_POINT",
  "EMOTIONAL_RELEASE",
  "CLOSING_RESONANCE",
  "MARKETING_REUSE",
] as const;
const TIERS = ["A", "B", "C"] as const;

const tierField = z.preprocess(
  (v) => normalizeEnum(v, TIERS, { "1": "A", "2": "B", "3": "C", TIER_1: "A", TIER_2: "B", TIER_3: "C" }, "C"),
  z.enum(TIERS),
);

const ExtractedResearchSchema = z.object({
  sources: z
    .array(
      z.object({
        ref: z.string().describe("short key used by items to reference this source"),
        title: z.string(),
        url: z.string().default(""),
        publisher: z.string().nullish(),
        author: z.string().nullish(),
        tier: tierField.default("C"),
      }),
    )
    .default([]),
  items: z
    .array(
      z.object({
        itemType: z.preprocess(
          (v) => normalizeEnum(v, RESEARCH_ITEM_TYPES, RESEARCH_ITEM_SYNONYMS, "FACT"),
          z.enum(RESEARCH_ITEM_TYPES),
        ),
        claimText: z.string(),
        evidenceExcerpt: z.string().nullish(),
        sourceRef: z.string().nullish(),
        verified: z.boolean().default(false),
      }),
    )
    .default([]),
});

const ExtractedStoriesSchema = z.object({
  sources: z
    .array(
      z.object({
        ref: z.string(),
        title: z.string(),
        url: z.string().default(""),
        publisher: z.string().nullish(),
        tier: tierField.default("C"),
      }),
    )
    .default([]),
  stories: z
    .array(
      z.object({
        title: z.string(),
        summary: z.string(),
        whyItMatters: z.string().default(""),
        emotionalRole: z.string().default(""),
        storyType: z.preprocess(
          (v) => normalizeEnum(v, STORY_TYPES, { PIVOT: "TURNING_POINT", COMEBACK: "RECOVERY", CRISIS: "DECISION_UNDER_PRESSURE" }, "TURNING_POINT"),
          z.enum(STORY_TYPES),
        ),
        storyFit: z.preprocess(
          (v) => normalizeEnum(v, STORY_FITS, { HOOK: "OPENING_HOOK", EVIDENCE: "PROOF_POINT", CLOSER: "CLOSING_RESONANCE" }, "PROOF_POINT"),
          z.enum(STORY_FITS),
        ),
        sourceRef: z.string().nullish(),
      }),
    )
    .default([]),
});

const RESEARCH_EXTRACTION_PROMPT = `You are a precise data-extraction engine. The text below is a chapter research dossier written by a research agent. Extract every distinct research item into structured JSON.

Rules:
- Every fact, statistic, quote, example, case study, counterpoint, and definition becomes one item.
- Copy claim text faithfully; do not invent or embellish.
- Extract cited sources into the sources array. Items reference sources by "ref". Use the citation tiers in the text (Tier 1/A = A, Tier 2/B = B, everything else = C).
- Claims labeled "Training knowledge" or "Unverified" get no sourceRef and verified=false.
- Claims with an explicit source citation get verified=true only if the dossier marks them verified/confirmed.

Respond with ONLY a JSON object matching:
{"sources":[{"ref":"s1","title":"...","url":"...","publisher":null,"author":null,"tier":"A"}],"items":[{"itemType":"FACT","claimText":"...","evidenceExcerpt":null,"sourceRef":"s1","verified":false}]}`;

const STORIES_EXTRACTION_PROMPT = `You are a precise data-extraction engine. The text below is a chapter external-stories dossier written by a story-research agent. Extract every distinct story into structured JSON.

Rules:
- Each named story/case/anecdote becomes one entry with title, 1-3 sentence summary, whyItMatters, and emotionalRole taken from the text.
- Classify storyType and storyFit from the fixed vocabularies; pick the closest match.
- Extract cited sources into the sources array; stories reference them by "ref". Tier 1/A = A, Tier 2/B = B, else C.

Respond with ONLY a JSON object matching:
{"sources":[{"ref":"s1","title":"...","url":"...","publisher":null,"tier":"B"}],"stories":[{"title":"...","summary":"...","whyItMatters":"...","emotionalRole":"...","storyType":"TURNING_POINT","storyFit":"PROOF_POINT","sourceRef":"s1"}]}`;

function decimal(value: number) {
  return new Prisma.Decimal(value.toFixed(2));
}

async function runExtractionModel(prompt: string, dossierText: string) {
  // Haiku-class task: mechanical extraction, no reasoning depth needed.
  const model = await getModelForRole("research:agent-3-verifier");
  if (!model) return null;

  const { SystemMessage, HumanMessage } = await import("@langchain/core/messages");
  const response = await model.invoke([
    new SystemMessage(prompt),
    new HumanMessage(dossierText.slice(0, 60_000)),
  ]);
  return typeof response.content === "string"
    ? response.content
    : Array.isArray(response.content)
      ? response.content
          .filter((c): c is { type: "text"; text: string } => typeof c === "object" && "text" in c)
          .map((c) => c.text)
          .join("")
      : "";
}

/**
 * Extract structured research items from a saved dossier and persist them,
 * linked to the artifact version. Idempotent per version: re-running clears
 * and rewrites that version's rows.
 */
export async function extractResearchStructure(args: {
  bookId: string;
  chapterKey: string;
  versionId: string;
  dossierText: string;
}) {
  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: args.bookId, stageKey: StageKey.RESEARCH } },
    select: { id: true },
  });
  if (!stage) return { items: 0, sources: 0 };

  const raw = await runExtractionModel(RESEARCH_EXTRACTION_PROMPT, args.dossierText);
  if (!raw) return { items: 0, sources: 0 };

  const parsed = ExtractedResearchSchema.safeParse(parseJsonFromText(raw));
  if (!parsed.success) {
    console.warn(
      `[structured-extraction] research parse failed for version ${args.versionId}: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")} | raw head: ${raw.slice(0, 200)}`,
    );
    return { items: 0, sources: 0 };
  }
  const { sources, items } = parsed.data;

  await db.researchItem.deleteMany({ where: { researchArtifactVersionId: args.versionId } });
  await db.researchSource.deleteMany({ where: { researchArtifactVersionId: args.versionId } });

  const sourceIdByRef = new Map<string, string>();
  for (const source of sources) {
    const row = await db.researchSource.create({
      data: {
        bookId: args.bookId,
        stageId: stage.id,
        researchArtifactVersionId: args.versionId,
        chapterKey: args.chapterKey,
        url: stripNullChars(source.url || "about:training-knowledge"),
        title: stripNullChars(source.title).slice(0, 500),
        publisher: source.publisher ? stripNullChars(source.publisher) : null,
        author: source.author ? stripNullChars(source.author) : null,
        sourceTier: source.tier as ResearchSourceTier,
        tierWeight: decimal(TIER_WEIGHT[source.tier] ?? 0.4),
      },
    });
    sourceIdByRef.set(source.ref, row.id);
  }

  // Items whose claim came from training knowledge still need a source row
  // (the FK is required) — one shared synthetic source per version.
  let trainingSourceId: string | null = null;
  async function getTrainingSourceId() {
    if (trainingSourceId) return trainingSourceId;
    const row = await db.researchSource.create({
      data: {
        bookId: args.bookId,
        stageId: stage!.id,
        researchArtifactVersionId: args.versionId,
        chapterKey: args.chapterKey,
        url: "about:training-knowledge",
        title: "Model training knowledge (verify before publishing)",
        sourceTier: ResearchSourceTier.C,
        tierWeight: decimal(TIER_WEIGHT.C),
      },
    });
    trainingSourceId = row.id;
    return row.id;
  }

  let created = 0;
  for (const item of items) {
    const sourceId =
      (item.sourceRef ? sourceIdByRef.get(item.sourceRef) : null) ?? (await getTrainingSourceId());
    const tier = sources.find((s) => s.ref === item.sourceRef)?.tier ?? "C";
    await db.researchItem.create({
      data: {
        bookId: args.bookId,
        stageId: stage.id,
        researchArtifactVersionId: args.versionId,
        sourceRecordId: sourceId,
        chapterKey: args.chapterKey,
        itemType: item.itemType as ResearchItemType,
        claimText: stripNullChars(item.claimText),
        evidenceExcerpt: item.evidenceExcerpt ? stripNullChars(item.evidenceExcerpt) : null,
        sourceTier: tier as ResearchSourceTier,
        tierWeight: decimal(TIER_WEIGHT[tier] ?? 0.4),
        verificationStatus: item.verified ? "VERIFIED" : "NEEDS_CORROBORATION",
      },
    });
    created += 1;
  }

  return { items: created, sources: sourceIdByRef.size };
}

/**
 * Extract structured story items from a saved external-stories dossier.
 * Idempotent per version, same contract as extractResearchStructure.
 */
export async function extractExternalStoryStructure(args: {
  bookId: string;
  chapterKey: string;
  versionId: string;
  dossierText: string;
}) {
  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: args.bookId, stageKey: StageKey.EXTERNAL_STORIES } },
    select: { id: true },
  });
  if (!stage) return { stories: 0, sources: 0 };

  const raw = await runExtractionModel(STORIES_EXTRACTION_PROMPT, args.dossierText);
  if (!raw) return { stories: 0, sources: 0 };

  const parsed = ExtractedStoriesSchema.safeParse(parseJsonFromText(raw));
  if (!parsed.success) {
    console.warn(
      `[structured-extraction] stories parse failed for version ${args.versionId}: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")} | raw head: ${raw.slice(0, 200)}`,
    );
    return { stories: 0, sources: 0 };
  }
  const { sources, stories } = parsed.data;

  await db.externalStoryItem.deleteMany({ where: { storyArtifactVersionId: args.versionId } });
  await db.externalStorySource.deleteMany({ where: { storyArtifactVersionId: args.versionId } });

  const sourceIdByRef = new Map<string, string>();
  for (const source of sources) {
    const row = await db.externalStorySource.create({
      data: {
        bookId: args.bookId,
        stageId: stage.id,
        storyArtifactVersionId: args.versionId,
        chapterKey: args.chapterKey,
        url: stripNullChars(source.url || "about:training-knowledge"),
        title: stripNullChars(source.title).slice(0, 500),
        publisher: source.publisher ? stripNullChars(source.publisher) : null,
        sourceTier: source.tier as StorySourceTier,
        tierWeight: decimal(TIER_WEIGHT[source.tier] ?? 0.4),
      },
    });
    sourceIdByRef.set(source.ref, row.id);
  }

  let fallbackSourceId: string | null = null;
  async function getFallbackSourceId() {
    if (fallbackSourceId) return fallbackSourceId;
    const row = await db.externalStorySource.create({
      data: {
        bookId: args.bookId,
        stageId: stage!.id,
        storyArtifactVersionId: args.versionId,
        chapterKey: args.chapterKey,
        url: "about:training-knowledge",
        title: "Model training knowledge (verify before publishing)",
        sourceTier: StorySourceTier.C,
        tierWeight: decimal(TIER_WEIGHT.C),
      },
    });
    fallbackSourceId = row.id;
    return row.id;
  }

  let created = 0;
  for (const story of stories) {
    const sourceId =
      (story.sourceRef ? sourceIdByRef.get(story.sourceRef) : null) ??
      (await getFallbackSourceId());
    const tier = sources.find((s) => s.ref === story.sourceRef)?.tier ?? "C";
    await db.externalStoryItem.create({
      data: {
        bookId: args.bookId,
        stageId: stage.id,
        storyArtifactVersionId: args.versionId,
        sourceRecordId: sourceId,
        chapterKey: args.chapterKey,
        title: stripNullChars(story.title).slice(0, 500),
        summary: stripNullChars(story.summary),
        whyItMatters: stripNullChars(story.whyItMatters),
        emotionalRole: stripNullChars(story.emotionalRole),
        storyType: story.storyType as ExternalStoryType,
        storyFit: story.storyFit as ExternalStoryFit,
        sourceTier: tier as StorySourceTier,
        tierWeight: decimal(TIER_WEIGHT[tier] ?? 0.4),
      },
    });
    created += 1;
  }

  return { stories: created, sources: sourceIdByRef.size };
}

/**
 * Fire-and-forget wrapper used by save routes — never throws, never blocks.
 */
export function scheduleStructuredExtraction(args: {
  kind: "research" | "external-stories";
  bookId: string;
  chapterKey: string;
  versionId: string;
  dossierText: string;
}) {
  const run =
    args.kind === "research"
      ? extractResearchStructure(args)
      : extractExternalStoryStructure(args);
  void run.catch((err) => {
    console.error(
      `[structured-extraction] ${args.kind} extraction failed for version ${args.versionId}:`,
      err instanceof Error ? err.message : err,
    );
  });
}
