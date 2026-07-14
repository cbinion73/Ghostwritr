import type { BaseStoryBundle, BaseStoryChapter } from "../../base-story-types";
import type { BookSetupProfile } from "../../book-setup-types";
import type {
  ChapterDraftBundle,
} from "../../chapter-draft-types";
import type { ChapterExternalStoryDossier, ChapterExternalStoryItem } from "../../external-story-types";
import { countWords } from "../../manuscript-metrics";
import type { PromiseBrief } from "../../promise-types";
import type { ChapterResearchDossier, ChapterResearchItem } from "../../research-types";
import {
  resolveDominantFramework,
  type ChapterContext,
  type ResolvedFramework,
} from "./context";
import type { ChapterWordTarget } from "./workspace-support";

export type ChapterDraftAdversarialCriticResult = {
  summary: string;
  riskLevel: "low" | "medium" | "high";
  aiTellFlags: string[];
  paddingFlags: string[];
  voiceFlags: string[];
  recommendations: string[];
};

export type SourceWeaveRequirements = {
  requiredCategories: string[];
  missingCategoryWarnings: string[];
  priorities: string[];
  chapterMandate: string[];
  argumentAnchors: string[];
};

export function sanitizeDraftProse(value: string) {
  return value
    .replace(
      /\bAdd enough developed explanation, specificity, and connective tissue to support roughly \d+ words of finished prose\.?/gi,
      "",
    )
    .replace(
      /\bAdd concrete illustration, fuller explanation, and a cleaner transition so this section does more real narrative and analytical work\.?/gi,
      "",
    )
    .replace(
      /\bThis paragraph should do enough work to carry roughly \d+ words of developed nonfiction prose once fully written\.?/gi,
      "",
    )
    .replace(/\bdo not use em dashes\b/gi, "")
    .replace(/\bkeep the revised chapter inside the requested target band when possible\b/gi, "")
    .replace(/\bopen the chapter by\b/gi, "")
    .replace(/\bone strong proof point here is\b/gi, "")
    .replace(/\ba useful outside story is\b/gi, "")
    .replace(/\bthis chapter advances the larger movement of\b/gi, "")
    .replace(/\s+\./g, ".")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function hasMetaDraftLanguage(value: string) {
  const text = value.toLowerCase();
  return [
    "this chapter begins by",
    "open the chapter by",
    "one strong proof point here is",
    "a useful outside story is",
    "surface the forces",
    "raise the stakes so the reader sees",
    "to move forward, the chapter has to",
    "the chapter advances the larger",
    "create the pivot from diagnosis",
  ].some((snippet) => text.includes(snippet));
}

export function deterministicAdversarialCritic(
  draft: ChapterDraftBundle,
  chapterTarget: ChapterWordTarget | null,
): ChapterDraftAdversarialCriticResult {
  const text = draft.chapterText;
  const aiTellFlags: string[] = [];
  const paddingFlags: string[] = [];
  const voiceFlags: string[] = [];

  if (hasMetaDraftLanguage(text)) {
    aiTellFlags.push("The draft still contains planning-shaped meta language instead of finished prose.");
  }
  if (/[—]/.test(text)) {
    aiTellFlags.push("The draft uses an em dash, which violates the style guard.");
  }
  if (/\b(in conclusion|ultimately|it is important to note|delve into|landscape|leverage)\b/i.test(text)) {
    aiTellFlags.push("The draft is using generic or overfamiliar AI-adjacent transition language.");
  }
  if (/\bthis chapter\b/i.test(text) || /\bthe reader\b/i.test(text)) {
    aiTellFlags.push("The prose refers to the writing itself instead of staying inside the manuscript voice.");
  }

  const paragraphs = text.split(/\n\s*\n/).map((entry) => entry.trim()).filter(Boolean);
  const repeatedOpeners = new Map<string, number>();
  for (const paragraph of paragraphs) {
    const opener = paragraph.split(/\s+/).slice(0, 3).join(" ").toLowerCase();
    if (opener) {
      repeatedOpeners.set(opener, (repeatedOpeners.get(opener) ?? 0) + 1);
    }
  }
  if ([...repeatedOpeners.values()].some((count) => count >= 3)) {
    voiceFlags.push("Several paragraphs begin with overly repetitive rhythm, which makes the voice feel machine-shaped.");
  }

  if (chapterTarget) {
    const wordCount = countWords(text);
    const delta = Math.abs(wordCount - chapterTarget.targetWords);
    if (delta > Math.max(200, Math.round(chapterTarget.targetWords * 0.18))) {
      paddingFlags.push("The chapter is still drifting too far from the intended length target to trust the prose shape.");
    }
  }

  if (paragraphs.some((paragraph) => paragraph.split(/\s+/).filter(Boolean).length < 35)) {
    paddingFlags.push("At least one paragraph is so thin that it still reads like a drafted note instead of finished manuscript prose.");
  }

  const allFlags = [...aiTellFlags, ...paddingFlags, ...voiceFlags];
  return {
    summary:
      allFlags.length === 0
        ? "The prose does not show obvious AI tells, padding, or voice drift under deterministic review."
        : allFlags[0],
    riskLevel: allFlags.length >= 4 ? "high" : allFlags.length >= 2 ? "medium" : allFlags.length === 1 ? "low" : "low",
    aiTellFlags,
    paddingFlags,
    voiceFlags,
    recommendations:
      allFlags.length === 0
        ? ["Keep the current natural voice and source integration intact during further revision."]
        : [
            "Rewrite any paragraph that talks about what the chapter is doing instead of simply doing it.",
            "Replace generic abstractions with concrete consequence and natural transition.",
            "Expand thin paragraphs with real explanation or scene detail rather than filler phrasing.",
          ],
  };
}

export function cleanEvidenceText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value
    .replace(/skip to main content/gi, "")
    .replace(/official websites use \.gov/gi, "")
    .replace(/here's how you know/gi, "")
    .replace(/jump to content/gi, "")
    .replace(/subscribe to [^.]+/gi, "")
    .replace(/have a website account\??/gi, "")
    .replace(/\b(log in|login|sign in|account settings)\b/gi, "")
    .replace(/\s+\|\s+/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function shortenEvidenceText(value: string, maxLength = 220) {
  if (value.length <= maxLength) {
    return value;
  }

  const shortened = value.slice(0, maxLength);
  const safeCut = shortened.lastIndexOf(" ");
  return `${(safeCut > 80 ? shortened.slice(0, safeCut) : shortened).trim()}...`;
}

function toSentence(value: string | null | undefined) {
  const trimmed = sanitizeDraftProse(value ?? "");
  if (!trimmed) {
    return "";
  }

  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function trimToWordLimit(text: string, maximumWords: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maximumWords) {
    return text.trim();
  }

  return `${words.slice(0, maximumWords).join(" ").trim()}`.replace(/\s+([,.;!?])/g, "$1");
}

export function buildDeterministicParagraphProse(args: {
  paragraph: ChapterContext["chapter"]["paragraphs"][number];
  paragraphIndex: number;
  targetWords: number;
  researchItem?: ChapterResearchItem | null;
  externalStory?: ChapterExternalStoryItem | null;
  personalStory?: { title: string; summary: string; whyItMatters?: string | null } | null;
  baseStoryChapter?: BaseStoryChapter | null;
  chapterTitle: string;
}) {
  const {
    paragraph,
    paragraphIndex,
    targetWords,
    researchItem,
    externalStory,
    personalStory,
    baseStoryChapter,
    chapterTitle,
  } = args;

  const bridgePhrases = [
    "That matters because",
    "What follows from that is that",
    "In lived terms,",
    "The real consequence is that",
    "Seen up close,",
    "In practice,",
  ];
  const consequencePhrases = [
    "pressure compounds when nobody redesigns the condition that keeps creating the problem",
    "people start mistaking heroic effort for a system that actually works",
    "small frictions turn into expensive habits because the structure never gets corrected",
    "teams normalize the workaround and stop seeing the design flaw underneath it",
    "the reader can feel the gap between what sounds right and what actually holds up in the room",
  ];

  const evidenceSentence = researchItem
    ? toSentence(
        `A concrete anchor here comes from ${cleanEvidenceText(
          researchItem.summary || researchItem.claimText,
        ).replace(/^[a-z]/, (letter) => letter.toUpperCase())}`,
      )
    : "";
  const outsideStorySentence = externalStory
    ? toSentence(
        `${cleanEvidenceText(externalStory.title)} gives the chapter a real-world face: ${cleanEvidenceText(
          externalStory.summary,
        )}`,
      )
    : "";
  const personalStorySentence = personalStory
    ? toSentence(
        `${personalStory.title} belongs here because ${cleanEvidenceText(
          personalStory.summary,
        ).replace(/^[a-z]/, (letter) => letter.toUpperCase())}`,
      )
    : "";
  const baseStorySentence = baseStoryChapter
    ? toSentence(
        `${baseStoryChapter.guidance.draftingInstruction} This is how ${chapterTitle} keeps the book's larger movement alive.`,
      )
    : "";

  const sentences = [
    toSentence(paragraph.topicSentence),
    toSentence(paragraph.mainIdea || paragraph.purpose),
    toSentence(
      `${bridgePhrases[paragraphIndex % bridgePhrases.length]} ${consequencePhrases[paragraphIndex % consequencePhrases.length]}`,
    ),
    evidenceSentence,
    outsideStorySentence,
    personalStorySentence,
    baseStorySentence,
    toSentence(
      `${paragraph.purpose} The point is not merely to name the pattern, but to make its stakes impossible to ignore.`,
    ),
  ].filter(Boolean);

  let prose = sentences.join(" ");
  const expansionPool = [
    toSentence(
      `${paragraph.hook || paragraph.topicSentence} The paragraph should feel like finished prose, so the explanation has to earn the turn from observation into meaning.`,
    ),
    toSentence(
      `${bridgePhrases[(paragraphIndex + 2) % bridgePhrases.length]} the chapter gains force when the evidence is translated into implication instead of left sitting on the page as a fact.`,
    ),
    toSentence(
      `${consequencePhrases[(paragraphIndex + 2) % consequencePhrases.length].replace(/^[a-z]/, (letter) =>
        letter.toUpperCase(),
      )}, which is why this section keeps pressing beyond description into consequence.`,
    ),
  ].filter(Boolean);

  let expansionIndex = 0;
  while (countWords(prose) < targetWords && expansionPool.length > 0) {
    prose = `${prose} ${expansionPool[expansionIndex % expansionPool.length]}`.trim();
    expansionIndex += 1;
    if (expansionIndex > 12) {
      break;
    }
  }

  return trimToWordLimit(sanitizeDraftProse(prose), Math.max(targetWords, Math.round(targetWords * 1.08)));
}

export function compactResearchItem(item: ChapterResearchItem) {
  return {
    id: item.id,
    type: item.itemType,
    claim: shortenEvidenceText(cleanEvidenceText(item.summary || item.claimText)),
    sourceTier: item.sourceTier,
  };
}

export function compactExternalStory(item: ChapterExternalStoryItem) {
  return {
    id: item.id,
    title: shortenEvidenceText(cleanEvidenceText(item.title), 120),
    summary: shortenEvidenceText(cleanEvidenceText(item.summary), 220),
    whyItMatters: shortenEvidenceText(cleanEvidenceText(item.whyItMatters), 180),
    fit: item.storyFit,
    type: item.storyType,
  };
}

// For a Biblical/Theological-lens book, the framework's "truth" beat (the
// principle the chapter delivers) shouldn't be a generic secular insight —
// it should be what God actually says. Swapping the slot's own prompt text
// here means every persona's framework that happens to have a "truth" slot
// (currently just AndyGPT's ME-WE-TRUTH-YOU-WE) gets this automatically,
// without needing a separate Christian-only framework to maintain.
const BIBLICAL_TRUTH_SLOT_PROMPT =
  "Answer the chapter's tension with what GOD says about it directly. Cite the specific passage(s) of Scripture that speak to it, what Jesus says or models if relevant, and the doctrinal principle at stake. Where possible, name a biblical story or historical figure from Scripture who faced a genuinely similar tension and draw out the truth their experience reveals. This beat must be grounded in God's own words and character — not a generic secular principle dressed in Christian language.";

export function renderFrameworkSlotsForPrompt(framework: ResolvedFramework, isBiblical: boolean): string {
  if (framework.flow.length === 0) {
    return "  (no framework flow available — default to natural chapter progression)";
  }
  return framework.flow
    .map((step) => {
      const prompt = isBiblical && step.slot === "truth" ? BIBLICAL_TRUTH_SLOT_PROMPT : step.prompt;
      return `  ${step.slot}: ${prompt}`;
    })
    .join("\n");
}

export function buildSourceWeaveRequirements(
  research: ChapterResearchDossier | null,
  externalStories: ChapterExternalStoryDossier | null,
  relevantPersonalStories: Array<{
    title: string;
    summary: string;
    whyItMatters: string;
  }>,
  baseStoryChapter: BaseStoryChapter | null,
): SourceWeaveRequirements {
  const requiredCategories: string[] = [];
  const missingCategoryWarnings: string[] = [];
  const priorities: string[] = [];

  if (research && (research.factBank.length > 0 || research.statistics.length > 0 || research.examples.length > 0)) {
    requiredCategories.push("research");
    priorities.push(
      "Ground at least one core move in a concrete verified fact, statistic, or example so the chapter earns authority instead of merely asserting it.",
    );
  } else {
    missingCategoryWarnings.push("No committed research evidence is available for this chapter yet.");
  }

  if (externalStories && externalStories.storyCandidates.length > 0) {
    requiredCategories.push("external story");
    priorities.push(
      "Use one outside case or story only where it creates belief, tension, or a meaningful real-world turn in the chapter.",
    );
  } else {
    missingCategoryWarnings.push("No committed external story dossier is available for this chapter yet.");
  }

  if (relevantPersonalStories.length > 0) {
    requiredCategories.push("personal story");
    priorities.push(
      "Use one personal story beat when it sharpens authenticity or emotional specificity rather than merely decorating the point.",
    );
  } else {
    missingCategoryWarnings.push("No clearly relevant personal story match was found for this chapter.");
  }

  if (baseStoryChapter) {
    requiredCategories.push("base story thread");
    priorities.push(
      "Keep the chapter visibly connected to the larger book movement so the manuscript feels unified from chapter to chapter.",
    );
  } else {
    missingCategoryWarnings.push("No base-story chapter thread was resolved for this chapter.");
  }

  return {
    requiredCategories,
    missingCategoryWarnings,
    priorities,
    chapterMandate: [
      baseStoryChapter?.chapterPurpose,
      baseStoryChapter?.threadRole,
      baseStoryChapter?.movement.truth,
    ].filter((value): value is string => Boolean(value?.trim())),
    argumentAnchors: [
      ...(research?.researchQuestions.map((question) => question.question) ?? []),
      ...(research?.gaps ?? []),
    ]
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 4),
  };
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function averageSentenceLength(text: string) {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return 0;
  }

  return Math.round(
    sentences.reduce((sum, sentence) => sum + countWords(sentence), 0) / sentences.length,
  );
}

export function countParagraphAnchorHits(draft: ChapterDraftBundle, context: ChapterContext) {
  const body = draft.chapterText.toLowerCase();
  return context.chapter.paragraphs.filter((paragraph) => {
    const anchor = paragraph.topicSentence
      .split(/\W+/)
      .find((word) => word.length > 4);
    return anchor ? body.includes(anchor.toLowerCase()) : false;
  }).length;
}

export function countMandateHits(text: string, values: string[]) {
  const body = text.toLowerCase();
  return values.filter((value) => {
    const anchor = value
      .split(/\W+/)
      .find((word) => word.length > 4);
    return anchor ? body.includes(anchor.toLowerCase()) : false;
  }).length;
}

/**
 * Run-stable book context — identical for every chapter in a workflow run,
 * so it lives in the cached system prefix (Anthropic prompt caching) instead
 * of being re-sent at full input price inside each per-chapter packet.
 */
export function buildSharedBookContextJson(
  promise: PromiseBrief,
  bookSetupProfile: BookSetupProfile | null,
  baseStory: BaseStoryBundle | null,
): string {
  const framework = resolveDominantFramework(bookSetupProfile?.writerPersonaBlend);
  const shared = {
    promise,
    bookSetupProfile: bookSetupProfile
      ? {
          writerPersona: bookSetupProfile.writerPersona,
          writerPersonaGuidance: bookSetupProfile.writerPersonaGuidance ?? [],
          voiceReferenceNotes: bookSetupProfile.voiceReferenceNotes,
          notesToSystem: bookSetupProfile.notesToSystem,
        }
      : null,
    voice: {
      dominantPersona: framework.dominantPersona,
      frameworkName: framework.name,
      frameworkFlow: framework.flow.map((step) => ({ slot: step.slot, prompt: step.prompt })),
    },
    baseStoryBook: baseStory
      ? {
          premise: baseStory.narrativeGuidance.premise,
          throughLine: baseStory.narrativeGuidance.throughLine,
          movement: baseStory.narrativeGuidance.movement,
          boundary: baseStory.narrativeGuidance.boundary,
        }
      : null,
  };
  return `SHARED BOOK CONTEXT (identical for every chapter in this run):\n${JSON.stringify(shared)}`;
}
