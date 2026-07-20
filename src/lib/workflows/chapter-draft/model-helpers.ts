import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

import type { BaseStoryBundle, BaseStoryChapter } from "../../base-story-types";
import type { BookSetupProfile } from "../../book-setup-types";
import type {
  ChapterDraftBundle,
  ChapterDraftParagraph,
  ChapterReviewBundle,
} from "../../chapter-draft-types";
import type { ChapterExternalStoryDossier } from "../../external-story-types";
import { getModelForRole } from "../../llm/routing";
import { buildCachedSystemBlocks } from "../../llm/providers";
import { countWords } from "../../manuscript-metrics";
import { getPersonalStoryFollowUpsForChapter } from "../../personal-story-contract";
import type { PersonalStoryEncyclopedia } from "../../personal-story-types";
import type { Phase1StrategicBrief } from "../../phase1-strategic-brief";
import type { PromiseBrief } from "../../promise-types";
import { resolveResearchLens } from "../../research-lenses";
import type { ChapterResearchDossier } from "../../research-types";
import {
  buildSharedBookContextJson,
  buildSourceWeaveRequirements,
  deterministicAdversarialCritic,
  hasMetaDraftLanguage,
  renderFrameworkSlotsForPrompt,
  sanitizeDraftProse,
  type ChapterDraftAdversarialCriticResult,
  type SourceWeaveRequirements,
} from "./execution-support";
import {
  resolveDominantFramework,
  validateQuillContextReadiness,
  type ChapterContext,
} from "./context";
import { findPersonalStoryCards } from "./source-availability";
import type { ChapterWordTarget } from "./workspace-support";

const DraftSchema = z.object({
  openingHook: z.string(),
  narrativeThread: z.string(),
  chapterText: z.string(),
  paragraphs: z.array(
    z.object({
      id: z.string(),
      topicSentence: z.string(),
      prose: z.string(),
      sourceNotes: z.array(z.string()).default([]),
    }),
  ),
  sourceUsage: z.object({
    research: z.array(z.string()).default([]),
    externalStories: z.array(z.string()).default([]),
    personalStories: z.array(z.string()).default([]),
    baseStory: z.array(z.string()).default([]),
    // Citation trace: the exact `id` values (from the research/externalStories
    // input arrays) the author actually wove into the prose. Enables the
    // linked-notes brain to distinguish "available" from "used".
    researchItemIds: z.array(z.string()).default([]),
    externalStoryItemIds: z.array(z.string()).default([]),
  }),
});

const ReviewSchema = z.object({
  overallAssessment: z.string(),
  strengths: z.array(z.string()).default([]),
  concerns: z.array(z.string()).default([]),
  revisionPriorities: z.array(z.string()).default([]),
  aiAuthorshipFlags: z.array(z.string()).default([]),
  verdict: z.enum(["ready_for_review", "needs_revision"]),
});

const AdversarialCriticSchema = z.object({
  summary: z.string(),
  riskLevel: z.enum(["low", "medium", "high"]),
  aiTellFlags: z.array(z.string()).default([]),
  paddingFlags: z.array(z.string()).default([]),
  voiceFlags: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

async function getAuthorModel() {
  // Routed via provider layer: Sonnet for cost-effective drafting
  //
  // timeoutMs was 30000 (30s) — confirmed too short live on 2026-07-07: a
  // real full chapter (large context, up to 16000 output tokens) routinely
  // takes 90+ seconds, so this call was silently timing out and falling
  // back to deterministic template prose on a real production book. That
  // silent fallback is now blocked; if Quill cannot run, generation stops
  // instead of saving fake manuscript text.
  return getModelForRole("chapter-draft:author", {
    temperature: 0.45,
    maxOutputTokens: 16000,
    timeoutMs: 120000,
  });
}

async function getReviewerModel() {
  // Routed via provider layer: Sonnet for fast revision
  // See getAuthorModel — same 30s-timeout bug, same fix.
  return getModelForRole("chapter-draft:revise", {
    temperature: 0.2,
    maxOutputTokens: 8000,
    timeoutMs: 120000,
  });
}

async function getVoiceGuardCriticModel() {
  return getModelForRole("voice-guard:critic", {
    temperature: 0.1,
    maxOutputTokens: 5000,
    timeoutMs: 30000,
  });
}

export async function runAdversarialProseCritic(
  promise: PromiseBrief,
  context: ChapterContext,
  draft: ChapterDraftBundle,
  chapterTarget: ChapterWordTarget | null,
): Promise<ChapterDraftAdversarialCriticResult> {
  const fallback = deterministicAdversarialCritic(draft, chapterTarget);
  const model = await getVoiceGuardCriticModel();
  if (!model) {
    return fallback;
  }

  try {
    const structured = model.withStructuredOutput(AdversarialCriticSchema);
    const result = await structured.invoke([
      new SystemMessage(`
You are the adversarial prose critic in a ghostwriting pipeline.

Your job is not to be nice. Your job is to catch:
- AI tells
- consultant tone
- padded explanation
- repetitive sentence rhythm
- chapter prose that talks about itself instead of simply reading like a book

Return only the structured critique. Be specific and tough.
      `),
      new HumanMessage(
        JSON.stringify({
          promise,
          chapter: context.chapter,
          chapterTarget,
          draft,
        }),
      ),
    ]);
    return {
      summary: result.summary,
      riskLevel: result.riskLevel,
      aiTellFlags: result.aiTellFlags ?? [],
      paddingFlags: result.paddingFlags ?? [],
      voiceFlags: result.voiceFlags ?? [],
      recommendations: result.recommendations ?? [],
    };
  } catch (err) {
    console.error(`[chapter-draft] runAdversarialProseCritic failed for ${context.chapter?.chapterId ?? "unknown"}, falling back to deterministic critic:`, err);
    return fallback;
  }
}

function buildAuthorInputPacket(
  phase1StrategicBrief: Phase1StrategicBrief | null,
  context: ChapterContext,
  research: ChapterResearchDossier | null,
  externalStories: ChapterExternalStoryDossier | null,
  personalStories: PersonalStoryEncyclopedia | null,
  baseStoryChapter: BaseStoryChapter | null,
  bookSetupProfile: BookSetupProfile | null,
  chapterTarget: ChapterWordTarget | null,
) {
  const readiness = validateQuillContextReadiness({
    phase1StrategicBrief,
    context,
    research,
    externalStories,
    personalStories,
    baseStoryChapter,
    bookSetupProfile,
  });
  if (!readiness.ok) {
    throw new Error(
      `Quill context is not ready for ${context.chapter.chapterTitle}: ${readiness.issues.join(" ")}`,
    );
  }

  const personalStoryFollowUps = getPersonalStoryFollowUpsForChapter(personalStories, {
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
  });
  const sourceWeavePlan = buildSourceWeaveRequirements(
    research,
    externalStories,
    readiness.packet.personalStories,
    baseStoryChapter,
  );

  return {
    quillContext: readiness.packet,
    sourceWeavePlan,
    section: {
      id: context.section.sectionId,
      title: context.section.sectionTitle,
      description: context.section.sectionDescription,
    },
    chapter: {
      id: context.chapter.chapterId,
      title: context.chapter.chapterTitle,
      description: context.chapter.chapterDescription,
    },
    // The committed Chapter Manifest's guidance for this chapter (opening
    // pattern, narrative arc, which sources to lean on) — follow it when
    // deciding how to weave the material below.
    manifestGuidance: context.manifestGuidance ?? null,
    chapterTarget,
    personalStoryFollowUps,
  };
}

function forceDraftTowardTarget(
  context: ChapterContext,
  draft: ChapterDraftBundle,
  chapterTarget: ChapterWordTarget | null,
) {
  if (!chapterTarget) {
    return draft;
  }

  // Never substitute template prose for missing paragraphs, pad with repeated
  // filler sentences, or hard-truncate to the word band — corrupted prose in a
  // committed manuscript is strictly worse than a length miss. The quality
  // assessor's "Length fit" / "Paragraph coverage" signals (and needsRevision)
  // report the miss so the repair loop / author can fix it with real writing.
  void context;
  return {
    ...draft,
    openingHook: sanitizeDraftProse(draft.openingHook),
    chapterText: sanitizeDraftProse(draft.chapterText),
    paragraphs: draft.paragraphs.map((paragraph) => ({
      ...paragraph,
      prose: sanitizeDraftProse(paragraph.prose),
    })),
  };
}

export async function enforceFinishedBookProse(
  promise: PromiseBrief,
  context: ChapterContext,
  draft: ChapterDraftBundle,
  bookSetupProfile: BookSetupProfile | null,
) {
  const combinedText = `${draft.openingHook}\n\n${draft.chapterText}`;
  if (!hasMetaDraftLanguage(combinedText)) {
    return draft;
  }

  const model = await getAuthorModel();
  if (!model) {
    return {
      ...draft,
      openingHook: sanitizeDraftProse(draft.openingHook),
      chapterText: sanitizeDraftProse(draft.chapterText),
      paragraphs: draft.paragraphs.map((paragraph) => ({
        ...paragraph,
        prose: sanitizeDraftProse(paragraph.prose),
      })),
    };
  }

  try {
    const structured = model.withStructuredOutput(DraftSchema);
    const result = await structured.invoke([
      new SystemMessage(`
Rewrite the supplied chapter draft into finished nonfiction book prose.

Hard rules:
- do not describe what the chapter is doing
- do not give writing instructions
- do not refer to "this chapter", "the reader", "open the chapter", or "proof point" language
- write actual Lean Labs manuscript prose
- keep the meaning, chapter structure, and source-backed ideas
- integrate research and stories naturally instead of naming sources
- copy the input draft's sourceUsage object through unchanged (including researchItemIds and externalStoryItemIds)
      `),
      new HumanMessage(
        JSON.stringify({
          promise,
          chapter: context.chapter,
          bookSetupProfile,
          draft,
        }),
      ),
    ]);

    return normalizeDraftResult(context, result);
  } catch (err) {
    console.error(`[chapter-draft] enforceFinishedBookProse failed for ${context.chapter?.chapterId ?? "unknown"}, keeping prior draft:`, err);
    return draft;
  }
}

function normalizeDraftResult(
  context: ChapterContext,
  result: {
    openingHook: string;
    narrativeThread: string;
    chapterText: string;
    paragraphs: Array<{
      id: string;
      topicSentence: string;
      prose: string;
      sourceNotes?: string[];
    }>;
    sourceUsage: {
      research?: string[];
      externalStories?: string[];
      personalStories?: string[];
      baseStory?: string[];
      researchItemIds?: string[];
      externalStoryItemIds?: string[];
    };
  },
): ChapterDraftBundle {
  const paragraphs: ChapterDraftParagraph[] = result.paragraphs.map((paragraph) => ({
    id: paragraph.id,
    topicSentence: paragraph.topicSentence,
    prose: sanitizeDraftProse(paragraph.prose),
    sourceNotes: paragraph.sourceNotes ?? [],
  }));
  const openingHook = sanitizeDraftProse(result.openingHook);
  const chapterBody =
    paragraphs.length > 0
      ? paragraphs.map((paragraph) => paragraph.prose).join("\n\n")
      : sanitizeDraftProse(result.chapterText);
  const chapterText = [openingHook, chapterBody].filter(Boolean).join("\n\n");

  return {
    chapterKey: context.chapter.chapterId,
    chapterTitle: context.chapter.chapterTitle,
    chapterDescription: context.chapter.chapterDescription,
    sectionTitle: context.section.sectionTitle,
    openingHook,
    narrativeThread: result.narrativeThread,
    chapterText,
    paragraphs,
    sourceUsage: {
      research: result.sourceUsage.research ?? [],
      externalStories: result.sourceUsage.externalStories ?? [],
      personalStories: result.sourceUsage.personalStories ?? [],
      baseStory: result.sourceUsage.baseStory ?? [],
      researchItemIds: result.sourceUsage.researchItemIds ?? [],
      externalStoryItemIds: result.sourceUsage.externalStoryItemIds ?? [],
    },
    quality: {
      score: 0,
      readiness: "needs attention",
      needsRevision: true,
      revisionPasses: 0,
      signals: [],
      integrity: {
        policyVersion: "chapter-integrity-v1",
        status: "warn",
        issues: [],
        usedEvidenceIds: [],
        namedAuthorities: [],
        directQuotationCount: 0,
        originalLanguageCount: 0,
      },
    },
  };
}

export async function generateDraft(
  phase1StrategicBrief: Phase1StrategicBrief | null,
  promise: PromiseBrief,
  context: ChapterContext,
  research: ChapterResearchDossier | null,
  externalStories: ChapterExternalStoryDossier | null,
  personalStories: PersonalStoryEncyclopedia | null,
  baseStory: BaseStoryBundle | null,
  baseStoryChapter: BaseStoryChapter | null,
  bookSetupProfile: BookSetupProfile | null,
  chapterTarget: ChapterWordTarget | null,
): Promise<ChapterDraftBundle> {
  const model = await getAuthorModel();
  if (!model) {
    throw new Error(
      `Cannot generate ${context.chapter.chapterTitle}: Quill author model is unavailable, and deterministic chapter fallback prose is blocked.`,
    );
  }

  try {
    const structured = model.withStructuredOutput(DraftSchema);
    const authorInput = buildAuthorInputPacket(
      phase1StrategicBrief,
      context,
      research,
      externalStories,
      personalStories,
      baseStoryChapter,
      bookSetupProfile,
      chapterTarget,
    );
    const framework = resolveDominantFramework(bookSetupProfile?.writerPersonaBlend);
    const isBiblicalLens = resolveResearchLens(bookSetupProfile?.researchLens).key === "biblical";
    const frameworkSlots = renderFrameworkSlotsForPrompt(framework, isBiblicalLens);
    // Shared book context is byte-identical across chapters — cached prefix.
    // Per-chapter packet drops the shared fields so they aren't re-sent.
    const sharedContext = buildSharedBookContextJson(promise, bookSetupProfile, baseStory);
    const chapterInput = authorInput;
    const result = await structured.invoke([
      new SystemMessage({
        content: buildCachedSystemBlocks(
          `
You are a ghostwriter writing a finished nonfiction book chapter for a real author.

Your job is to write the best, most human chapter you can from the material available to you.
Write like a real human author, not like a planner, analyst, or assistant.

Hard rules:
- do not use em dashes
- do not use ellipses for effect
- do not sound like AI, a consultant, or a motivational LinkedIn post
- avoid cliches, filler, and generic transitions
- vary sentence rhythm naturally
- write polished nonfiction prose, not bullet summaries
- use the paragraph topic sentences as the structural spine
- use research, external stories, personal stories, and base-story thread only where they genuinely strengthen the chapter
- if manifestGuidance is present, honor its opening pattern, narrative arc, and source assignments for this chapter — it is the author-approved plan for how this chapter weaves its material
- if quillContext.craftNotes is present, treat every note as a standing rule from the author — these are corrections they already had to make once, and repeating a corrected mistake is the fastest way to lose their trust
- do not mechanically mention every input
- aim for the chapter target range if one is provided
- if the chapter risks being too short, deepen explanation, examples, and analysis instead of padding
- never output writing instructions, drafting notes, target-word reminders, or any meta-commentary about the writing process
- never write sentences that describe what the chapter or paragraph should do; just write the actual chapter prose
- use research judiciously: convert it into synthesized insight, not citation-shaped prose
- use external stories judiciously: choose only the few that create belief, tension, or emotional lift
- use personal stories judiciously: only when they add authenticity and are truly relevant
- never dump raw source titles, website navigation text, or publication labels into the prose
- chapter openings should read like real opening pages in a published nonfiction book
- every paragraph should read like finished prose, not an outline point with evidence attached
- synthesize source material into narrative and argument; never paste source phrasing unless it is a real short quote
- honor the ${framework.name} framework (the dominant persona is ${framework.dominantPersona}); the chapter's shape is defined by this framework, not by generic teaching structure
- every paragraph should make a concrete move, support it with specificity, and then turn that specificity into consequence, implication, or insight
- if a paragraph only restates the point, deepen it until it earns its place in the chapter

Writing approach:
- be conversational, convincing, and grounded
- structure the chapter using the ${framework.name} framework — walk these beats in order; do NOT mechanically label them, but let the prose embody the progression:
${frameworkSlots}
- favor finished sentences, real transitions, and genuine authorial voice
- if a source helps, absorb it into the argument as a human writer would
- if a story helps, tell only the part that earns its place in the chapter
- satisfy the source-weave plan when material is available: normally absorb at least one concrete research anchor, one outside story or case, one relevant personal-story beat, and the base-story thread when those inputs exist
- keep the chapter mandate alive on the page so the prose clearly carries the intended chapter purpose, thread role, and paragraph-level movement

Citation trace (required):
- every research entry and external story in your input carries an "id" field
- in sourceUsage.researchItemIds, list the exact id of every research entry whose substance you actually used in the prose
- in sourceUsage.externalStoryItemIds, list the exact id of every external story you actually told or referenced
- copy ids verbatim; never invent ids; leave the arrays empty if you used none
- every paragraph sourceNotes array must contain only the exact evidence item IDs used in that paragraph; never put prose descriptions in sourceNotes
- do not name a scholar, historian, theologian, scientist, study, institution, book, report, or historical person unless that authority appears in the admitted evidence supplied for this chapter
- do not create a historical anecdote, attributed saying, blessing, quotation, statistic, date, etymology, Greek/Hebrew claim, or scientific mechanism from memory
- if admitted evidence does not support the exact statement you want to make, omit it or state the narrower supported claim
- distinguish the author's theological interpretation from documented history
- use direct quotation marks only when the quoted wording appears in the admitted supporting excerpt; otherwise paraphrase and preserve the evidence ID
- keep Greek or Hebrew only when it materially advances the argument and admitted lexical or textual evidence supports the form, transliteration, and gloss
- before returning the chapter, silently compare it with every standing craft note and remove any mistake the author has already corrected
      `,
          sharedContext,
          "1h",
        ),
      }),
      new HumanMessage(JSON.stringify(chapterInput)),
    ]);

    return normalizeDraftResult(context, result);
  } catch (err) {
    console.error(`[chapter-draft] generateDraft failed for ${context.chapter?.chapterId ?? "unknown"}; deterministic fallback draft is blocked:`, err);
    throw err;
  }
}

function fallbackReview(draft: ChapterDraftBundle): ChapterReviewBundle {
  const aiFlags = draft.chapterText.includes("—")
    ? ["Contains an em dash, which violates the style guard."]
    : [];

  return {
    chapterKey: draft.chapterKey,
    overallAssessment:
      "The chapter has a usable backbone and clear structure, but it should be reviewed for stronger narrative texture and cleaner transitions.",
    strengths: [
      "The chapter follows the planned topic-sentence structure.",
      "The supporting material is relevant to the chapter promise.",
    ],
    concerns: aiFlags.length > 0 ? aiFlags : ["Some passages may still read more planned than lived."],
    revisionPriorities: [
      "Sharpen the opening hook so the chapter begins with more tension.",
      "Make sure any source material feels integrated rather than pasted in.",
    ],
    aiAuthorshipFlags: aiFlags,
    verdict: aiFlags.length > 0 ? "needs_revision" : "ready_for_review",
  };
}

export async function reviewDraft(
  promise: PromiseBrief,
  context: ChapterContext,
  draft: ChapterDraftBundle,
  sourceWeaveFocus?: SourceWeaveRequirements,
  chapterTarget?: ChapterWordTarget | null,
): Promise<ChapterReviewBundle> {
  const fallback = fallbackReview(draft);
  const model = await getReviewerModel();
  const critic = await runAdversarialProseCritic(promise, context, draft, chapterTarget ?? null);
  if (!model) {
    return {
      ...fallback,
      overallAssessment: critic.summary || fallback.overallAssessment,
      concerns: [...new Set([...fallback.concerns, ...critic.paddingFlags, ...critic.voiceFlags])],
      revisionPriorities: [...new Set([...fallback.revisionPriorities, ...critic.recommendations])],
      aiAuthorshipFlags: [...new Set([...fallback.aiAuthorshipFlags, ...critic.aiTellFlags])],
      verdict:
        critic.riskLevel === "high" || critic.aiTellFlags.length > 0 || critic.paddingFlags.length > 0
          ? "needs_revision"
          : fallback.verdict,
    };
  }

  try {
    const structured = model.withStructuredOutput(ReviewSchema);
    const result = await structured.invoke([
      new SystemMessage({
        content: buildCachedSystemBlocks(
          `
You are the editorial feedback agent for a ghostwriting platform.

Review the draft like a sharp editor.

Rules:
- actively look for AI tells
- flag em dashes immediately
- flag generic abstractions, repetitive rhythm, inflated language, and consultant tone
- flag chapters that leave available research, outside stories, personal stories, or chapter-thread material underused
- flag paragraphs that never turn from evidence into consequence, interpretation, or implication
- prefer specific, actionable revision notes
- be tough but fair
      `,
          `SHARED BOOK CONTEXT (identical for every chapter in this run):\n${JSON.stringify({ promise })}`,
          "1h",
        ),
      }),
      new HumanMessage(
        JSON.stringify({
          chapter: context.chapter,
          sourceWeaveFocus,
          draft,
        }),
      ),
    ]);

    return {
      chapterKey: context.chapter.chapterId,
      overallAssessment: critic.summary
        ? `${result.overallAssessment} Adversarial critic: ${critic.summary}`
        : result.overallAssessment,
      strengths: result.strengths ?? [],
      concerns: [...new Set([...(result.concerns ?? []), ...critic.paddingFlags, ...critic.voiceFlags])],
      revisionPriorities: [...new Set([...(result.revisionPriorities ?? []), ...critic.recommendations])],
      aiAuthorshipFlags: [...new Set([...(result.aiAuthorshipFlags ?? []), ...critic.aiTellFlags])],
      verdict:
        result.verdict === "needs_revision" || critic.riskLevel === "high" || critic.aiTellFlags.length > 0
          ? "needs_revision"
          : result.verdict,
    };
  } catch (err) {
    console.error(`[chapter-draft] reviewDraft failed for ${context.chapter?.chapterId ?? "unknown"}, using deterministic fallback review:`, err);
    return {
      ...fallback,
      overallAssessment: critic.summary || fallback.overallAssessment,
      concerns: [...new Set([...fallback.concerns, ...critic.paddingFlags, ...critic.voiceFlags])],
      revisionPriorities: [...new Set([...fallback.revisionPriorities, ...critic.recommendations])],
      aiAuthorshipFlags: [...new Set([...fallback.aiAuthorshipFlags, ...critic.aiTellFlags])],
      verdict:
        critic.riskLevel === "high" || critic.aiTellFlags.length > 0 || critic.paddingFlags.length > 0
          ? "needs_revision"
          : fallback.verdict,
    };
  }
}

export async function reviseDraft(
  phase1StrategicBrief: Phase1StrategicBrief | null,
  promise: PromiseBrief,
  context: ChapterContext,
  draft: ChapterDraftBundle,
  review: ChapterReviewBundle,
  research: ChapterResearchDossier | null,
  externalStories: ChapterExternalStoryDossier | null,
  personalStories: PersonalStoryEncyclopedia | null,
  baseStory: BaseStoryBundle | null,
  baseStoryChapter: BaseStoryChapter | null,
  bookSetupProfile: BookSetupProfile | null,
  chapterTarget: ChapterWordTarget | null,
) {
  const model = await getAuthorModel();
  if (!model) {
    return draft;
  }

  try {
    const structured = model.withStructuredOutput(DraftSchema);
    const authorInput = buildAuthorInputPacket(
      phase1StrategicBrief,
      context,
      research,
      externalStories,
      personalStories,
      baseStoryChapter,
      bookSetupProfile,
      chapterTarget,
    );
    const framework = resolveDominantFramework(bookSetupProfile?.writerPersonaBlend);
    const isBiblicalLens = resolveResearchLens(bookSetupProfile?.researchLens).key === "biblical";
    const frameworkSlots = renderFrameworkSlotsForPrompt(framework, isBiblicalLens);
    const sharedContext = buildSharedBookContextJson(promise, bookSetupProfile, baseStory);
    const chapterInput = authorInput;
    const result = await structured.invoke([
      new SystemMessage({
        content: buildCachedSystemBlocks(
          `
Revise the chapter draft using the editorial feedback.

Hard rules:
- do not use em dashes
- remove AI-sounding phrasing
- keep the prose natural and human
- preserve the chapter structure and purpose
- keep the revised chapter inside the requested target band when possible
- remove any trace of meta-writing language, drafting instructions, or target-word commentary
- make the prose read like finished manuscript pages, not assembled source notes
- if a fact or story stays in the chapter, integrate it cleanly into the flow of the paragraph
- preserve and sharpen the intended ${framework.name} framework progression
- the dominant persona is ${framework.dominantPersona}; the revised chapter should walk these beats in order (do not label them — let the prose embody the progression):
${frameworkSlots}
- if research, outside stories, personal stories, or the base-story thread are available, make sure the revision uses the strongest ones intentionally rather than leaving them idle
- if quillContext.craftNotes is present, treat every note as a standing rule from the author — these are corrections they already had to make once; apply them throughout the revision
- make each paragraph earn itself by moving from assertion into consequence, interpretation, or real-world implication
- keep sourceUsage accurate: carry the input draft's researchItemIds/externalStoryItemIds forward, adding or removing ids only when the revision actually adds or drops that material
      `,
          sharedContext,
          "1h",
        ),
      }),
      new HumanMessage(
        JSON.stringify({
          authorInput: chapterInput,
          draft,
          review,
        }),
      ),
    ]);

    return normalizeDraftResult(context, result);
  } catch (err) {
    console.error(`[chapter-draft] reviseDraft failed for ${context.chapter?.chapterId ?? "unknown"}, keeping prior draft:`, err);
    return draft;
  }
}

export async function tuneDraftToTarget(
  promise: PromiseBrief,
  context: ChapterContext,
  draft: ChapterDraftBundle,
  bookSetupProfile: BookSetupProfile | null,
  chapterTarget: ChapterWordTarget | null,
) {
  if (!chapterTarget) {
    return draft;
  }

  const model = await getAuthorModel();
  if (!model) {
    return forceDraftTowardTarget(context, draft, chapterTarget);
  }

  let workingDraft = draft;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const currentWordCount = countWords(workingDraft.chapterText);
    if (
      currentWordCount >= chapterTarget.minimumWords &&
      currentWordCount <= chapterTarget.maximumWords
    ) {
      return workingDraft;
    }

    try {
      const structured = model.withStructuredOutput(DraftSchema);
      const result = await structured.invoke([
        new SystemMessage(`
You are adjusting a chapter draft to the right length without changing its meaning.

Rules:
- do not use em dashes
- preserve the chapter's argument and structure
- if short, deepen analysis, examples, and transitions
- if long, cut repetition and collapse overlap
- keep the result natural and human
- this is not optional: you must move the chapter materially closer to the requested range
- if the chapter is far too short, add substantial developed prose, not filler
- each paragraph should do real explanatory, narrative, or persuasive work
- never answer with notes about the target; return only finished book prose
- copy the input draft's sourceUsage object through unchanged (including researchItemIds and externalStoryItemIds)
      `),
        new HumanMessage(
          JSON.stringify({
            promise,
            chapter: context.chapter,
            bookSetupProfile,
            chapterTarget,
            currentWordCount,
            targetDelta: chapterTarget.targetWords - currentWordCount,
            attempt: attempt + 1,
            draft: workingDraft,
          }),
        ),
      ]);

      workingDraft = normalizeDraftResult(context, result);
    } catch (err) {
      console.error(`[chapter-draft] tuneDraftToTarget attempt ${attempt + 1} failed for ${context.chapter?.chapterId ?? "unknown"}, forcing draft toward target deterministically:`, err);
      return forceDraftTowardTarget(context, workingDraft, chapterTarget);
    }
  }

  return forceDraftTowardTarget(context, workingDraft, chapterTarget);
}
