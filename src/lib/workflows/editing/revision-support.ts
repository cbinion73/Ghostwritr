import type {
  EditorialAssessment,
  EditorialAssessmentChapterNote,
  EditorialMode,
  EditorialRevisionPlan,
  EditingChapterSnapshot,
  ManuscriptAssembly,
  SuggestedEditorialRevisionTarget,
} from "../../editing-types";
import { buildExcerpt } from "./workspace-support";

function countWords(value: string | null | undefined) {
  return value?.split(/\s+/).filter(Boolean).length ?? 0;
}

export function buildSourceDraftSignature(chapters: EditingChapterSnapshot[]) {
  return chapters
    .map(
      (chapter) =>
        `${chapter.chapterKey}:${chapter.approvedDraftVersionId ?? "unapproved"}:${countWords(chapter.chapterText)}:${chapter.chapterText}:${chapter.quality?.score ?? "na"}:${chapter.quality?.revisionPasses ?? 0}`,
    )
    .join("\n---\n");
}

export function buildBookWideEditorialFindings(chapters: EditingChapterSnapshot[]) {
  const repeatedOpeningWords = new Map<string, string[]>();
  const terminologyCounts = new Map<string, number>();
  const aiTellPhrases = [
    "in today's fast-paced world",
    "it is important to note",
    "delve into",
    "unlock",
    "game-changer",
    "journey",
    "at the end of the day",
    "not just",
  ];
  const aiArtifacts: string[] = [];
  const citations: string[] = [];
  const preservation: string[] = [];
  const chapterInstructions: string[] = [];

  for (const chapter of chapters) {
    const paragraphs = chapter.chapterText
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    const opening = paragraphs[0]?.slice(0, 120).toLowerCase() ?? "";
    if (opening) {
      const key = opening.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).slice(0, 8).join(" ");
      repeatedOpeningWords.set(key, [...(repeatedOpeningWords.get(key) ?? []), chapter.chapterLabel]);
    }

    for (const term of ["trust", "alignment", "accountability", "leadership", "influence", "system"]) {
      const matches = chapter.chapterText.match(new RegExp(`\\b${term}\\b`, "gi")) ?? [];
      terminologyCounts.set(term, (terminologyCounts.get(term) ?? 0) + matches.length);
    }

    const lower = chapter.chapterText.toLowerCase();
    for (const phrase of aiTellPhrases) {
      if (lower.includes(phrase)) {
        aiArtifacts.push(`${chapter.chapterLabel}: possible AI-shaped phrase "${phrase}".`);
      }
    }

    if (!/\[[^\]]+\]|\([^)]*\d{4}[^)]*\)|https?:\/\//.test(chapter.chapterText)) {
      citations.push(`${chapter.chapterLabel}: no visible citation marker or source cue in approved draft text.`);
    }

    if (chapter.reviewSummary) {
      preservation.push(`${chapter.chapterLabel}: preserve reviewed throughline: ${buildExcerpt(chapter.reviewSummary, 180)}`);
    }

    if (chapter.quality?.needsRevision) {
      chapterInstructions.push(
        `${chapter.chapterLabel}: resolve draft quality flags before final polish: ${buildExcerpt(buildChapterQualityDirective(chapter), 180)}`,
      );
    } else {
      chapterInstructions.push(
        `${chapter.chapterLabel}: preserve approved draft spine and avoid unnecessary rewrite.`,
      );
    }
  }

  const duplication = [...repeatedOpeningWords.entries()]
    .filter(([, labels]) => labels.length > 1)
    .map(([, labels]) => `Similar opening pattern appears in ${labels.join(", ")}.`);

  const continuity = chapters.slice(1).flatMap((chapter, index) => {
    const previous = chapters[index];
    if (!previous) {
      return [];
    }
    return chapter.sectionTitle === previous.sectionTitle
      ? [`Check transition continuity from ${previous.chapterLabel} into ${chapter.chapterLabel} inside ${chapter.sectionTitle}.`]
      : [`Check section handoff from ${previous.sectionTitle} into ${chapter.sectionTitle} at ${chapter.chapterLabel}.`];
  });

  const wordCounts = chapters.map((chapter) => chapter.wordCount).filter((count) => count > 0);
  const averageWords = wordCounts.length > 0
    ? Math.round(wordCounts.reduce((sum, count) => sum + count, 0) / wordCounts.length)
    : 0;
  const structure = chapters
    .filter((chapter) => averageWords > 0 && (chapter.wordCount < averageWords * 0.55 || chapter.wordCount > averageWords * 1.75))
    .map((chapter) => `${chapter.chapterLabel}: ${chapter.wordCount.toLocaleString()} words against ${averageWords.toLocaleString()} average; check pacing and proportional weight.`);

  const dominantTerms = [...terminologyCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([term, count]) => `${term}: ${count} uses`);

  return {
    duplication: duplication.length > 0 ? duplication.slice(0, 8) : ["No repeated opening pattern was detected by the deterministic scan."],
    continuity: continuity.slice(0, 8),
    structure: structure.length > 0 ? structure.slice(0, 8) : ["Chapter lengths are not showing obvious structural outliers."],
    voice: [
      "Preserve the approved Quill draft voice as the baseline for final revision.",
      "Use line-level polish only where it improves clarity, rhythm, or human texture.",
    ],
    aiArtifacts: aiArtifacts.length > 0 ? aiArtifacts.slice(0, 8) : ["No common AI-tell phrases were detected by the deterministic scan."],
    terminology: dominantTerms.length > 0 ? dominantTerms : ["No dominant repeated terminology was detected."],
    citations: citations.slice(0, 8),
    preservation: preservation.slice(0, 8),
    chapterInstructions: chapterInstructions.slice(0, 12),
  };
}

export function normalizeBookWideEditorialFindings(
  value: Partial<NonNullable<EditorialAssessment["bookWideFindings"]>> | null | undefined,
  fallback: NonNullable<EditorialAssessment["bookWideFindings"]>,
) {
  return {
    duplication: value?.duplication ?? fallback.duplication,
    continuity: value?.continuity ?? fallback.continuity,
    structure: value?.structure ?? fallback.structure,
    voice: value?.voice ?? fallback.voice,
    aiArtifacts: value?.aiArtifacts ?? fallback.aiArtifacts,
    terminology: value?.terminology ?? fallback.terminology,
    citations: value?.citations ?? fallback.citations,
    preservation: value?.preservation ?? fallback.preservation,
    chapterInstructions: value?.chapterInstructions ?? fallback.chapterInstructions,
  };
}

function getChapterQualityPrioritySignals(chapter: EditingChapterSnapshot) {
  return (chapter.quality?.signals ?? []).filter((signal) => signal.state !== "pass").slice(0, 3);
}

export function buildChapterQualityDirective(chapter: EditingChapterSnapshot) {
  const weakSignals = getChapterQualityPrioritySignals(chapter);
  if (weakSignals.length === 0) {
    return chapter.reviewSummary ?? `${chapter.chapterLabel} needs a cleaner editorial pass without losing its current role in the manuscript.`;
  }

  return weakSignals
    .map((signal) => `${signal.label}: ${signal.detail}`)
    .join(" ");
}

export function buildRevisionTargetOutcome(chapter: EditingChapterSnapshot, note?: EditorialAssessmentChapterNote) {
  const quality = chapter.quality;
  if (note?.observation) {
    return note.observation;
  }
  if (quality?.needsRevision) {
    return `Raise ${chapter.chapterLabel} above its current ${quality.score}/100 quality signal and resolve the main weak spots from the last draft pass, especially ${buildExcerpt(buildChapterQualityDirective(chapter), 200)}.`;
  }
  if (chapter.reviewSummary) {
    return chapter.reviewSummary;
  }

  return `Deliver a cleaner, more coherent revision of ${chapter.chapterLabel} that resolves its highest-leverage issue without drifting from the book's intent.`;
}

export function buildRevisionPreserveNotes(chapter: EditingChapterSnapshot) {
  const notes = new Set<string>();

  notes.add(`Preserve the role ${chapter.chapterLabel} plays inside the full manuscript arc.`);

  if (chapter.sectionTitle) {
    notes.add(`Keep this chapter aligned with the surrounding ${chapter.sectionTitle} section logic.`);
  }

  if (chapter.reviewSummary) {
    notes.add(`Do not lose the existing chapter throughline: ${buildExcerpt(chapter.reviewSummary, 180)}.`);
  }

  for (const signal of chapter.quality?.signals ?? []) {
    if (signal.state === "pass") {
      notes.add(`Keep this strength intact: ${signal.label}.`);
    }
    if (signal.state === "warn") {
      notes.add(`Tighten this without distorting the chapter's role: ${signal.label}.`);
    }
  }

  const weakSignals = getChapterQualityPrioritySignals(chapter);
  if (weakSignals.length > 0) {
    notes.add(`When revising, specifically protect the chapter's current wins while addressing ${weakSignals.map((signal) => signal.label).join(", ")}.`);
  }

  return Array.from(notes).slice(0, 4);
}

export function buildSuggestedRevisionTarget(params: {
  mode: EditorialMode;
  chapterKey?: string | null;
  selectedChapterKeys?: string[];
  brief: string;
  preserveNotes?: string[] | null;
}): SuggestedEditorialRevisionTarget {
  return {
    mode: params.mode,
    chapterKey: params.chapterKey ?? null,
    selectedChapterKeys: (params.selectedChapterKeys ?? []).filter(Boolean).slice(0, 6),
    brief: params.brief.trim(),
    preserveNotes: (params.preserveNotes ?? [])
      .map((note) => note.trim())
      .filter(Boolean)
      .slice(0, 5),
  };
}

function inferEditorialModeFromInput(input: string): EditorialMode {
  const normalized = input.toLowerCase();
  if (normalized.includes("continuity")) {
    return "continuity-pass";
  }
  if (normalized.includes("pacing")) {
    return "pacing-pass";
  }
  if (normalized.includes("voice")) {
    return "voice-consistency-pass";
  }
  if (normalized.includes("line edit") || normalized.includes("line-edit") || normalized.includes("copy edit")) {
    return "line-edit";
  }
  if (normalized.includes("structure") || normalized.includes("structural")) {
    return "structural-edit";
  }

  return "clarity-pass";
}

export function buildConversationSuggestedRevisionTarget(params: {
  manuscript: ManuscriptAssembly;
  chapterKey?: string | null;
  userInput: string;
}) {
  const { manuscript, chapterKey, userInput } = params;
  const mode = inferEditorialModeFromInput(userInput);

  if (chapterKey && manuscript.chapters.some((chapter) => chapter.chapterKey === chapterKey)) {
    return buildSuggestedRevisionTarget({
      mode,
      chapterKey,
      brief: `Revise ${chapterKey} based on the latest editor conversation without breaking its role in the full manuscript.`,
      preserveNotes: [
        "Preserve the current chapter's role inside the full book arc.",
        "Avoid introducing continuity drift against untouched chapters.",
      ],
    });
  }

  const normalized = userInput.toLowerCase();
  const prefersMultiSectionTarget =
    normalized.includes("whole-book") ||
    normalized.includes("whole book") ||
    normalized.includes("opening") ||
    normalized.includes("first chapters") ||
    normalized.includes("first two") ||
    normalized.includes("beginning") ||
    normalized.includes("multi-chapter") ||
    normalized.includes("multi chapter") ||
    normalized.includes("connected sections") ||
    normalized.includes("across chapters") ||
    normalized.includes("shared momentum") ||
    normalized.includes("continuity");

  const sortedByRisk = [...manuscript.chapters].sort((left, right) => {
    const leftScore = left.quality?.score ?? (left.reviewSummary ? 70 : 55);
    const rightScore = right.quality?.score ?? (right.reviewSummary ? 70 : 55);
    return leftScore - rightScore;
  });

  const selectedChapters = prefersMultiSectionTarget
    ? sortedByRisk.slice(0, Math.min(2, sortedByRisk.length))
    : sortedByRisk.slice(0, 1);
  const selectedChapterKeys = selectedChapters.map((chapter) => chapter.chapterKey);
  const hotspotSummary = selectedChapters
    .map((chapter) => `${chapter.chapterLabel}: ${buildExcerpt(buildChapterQualityDirective(chapter), 140)}`)
    .join(" ");

  return buildSuggestedRevisionTarget({
    mode,
    chapterKey: selectedChapterKeys.length === 1 ? selectedChapterKeys[0] : null,
    selectedChapterKeys,
    brief:
      selectedChapters.length > 1
        ? `Run a ${modeLabel(mode)} across the linked sections that carry the heaviest coherence pressure from the current manuscript state. Focus especially on ${hotspotSummary}`
        : `Run a ${modeLabel(mode)} on the highest-leverage chapter without losing its role in the book. Focus especially on ${hotspotSummary}`,
    preserveNotes: [
      "Preserve the manuscript's existing whole-book throughline while revising the selected material.",
      "Do not introduce continuity drift against untouched chapters.",
      ...selectedChapters.flatMap((chapter) => buildRevisionPreserveNotes(chapter).slice(0, 2)),
    ],
  });
}

export function resolveRevisionTargetChapters(params: {
  manuscript: ManuscriptAssembly;
  chapterKey?: string | null;
  selectedChapterKeys?: string[];
}) {
  const selectedChapterKeys = [...new Set((params.selectedChapterKeys ?? []).filter(Boolean))];
  if (selectedChapterKeys.length > 0) {
    const targetSet = new Set(selectedChapterKeys);
    const chapters = params.manuscript.chapters.filter((chapter) => targetSet.has(chapter.chapterKey));
    return {
      focusChapters: chapters,
      selectedChapterKeys,
      targetDescriptor:
        chapters.length === 1
          ? `${chapters[0]?.chapterLabel ?? "selected chapter"}`
          : `${chapters.length} selected sections`,
    };
  }

  if (params.chapterKey) {
    const chapters = params.manuscript.chapters.filter(
      (chapter) => chapter.chapterKey === params.chapterKey,
    );
    return {
      focusChapters: chapters,
      selectedChapterKeys: chapters.map((chapter) => chapter.chapterKey),
      targetDescriptor: chapters[0]?.chapterLabel ?? "selected chapter",
    };
  }

  const chapters = params.manuscript.chapters.slice(0, Math.min(3, params.manuscript.chapters.length));
  return {
    focusChapters: chapters,
    selectedChapterKeys: chapters.map((chapter) => chapter.chapterKey),
    targetDescriptor:
      chapters.length === 1 ? chapters[0]?.chapterLabel ?? "highest-leverage chapter" : "highest-leverage chapters",
  };
}

export function buildEditorialPromptChapterContext(chapter: EditingChapterSnapshot) {
  return {
    chapterKey: chapter.chapterKey,
    chapterLabel: chapter.chapterLabel,
    sectionTitle: chapter.sectionTitle,
    approvedDraftVersionId: chapter.approvedDraftVersionId ?? null,
    paragraphOutline: chapter.paragraphOutline ?? [],
    reviewSummary: chapter.reviewSummary,
    wordCount: chapter.wordCount,
    quality: chapter.quality,
    qualityDirective: buildChapterQualityDirective(chapter),
    strengthsToPreserve: (chapter.quality?.signals ?? [])
      .filter((signal) => signal.state === "pass")
      .slice(0, 3)
      .map((signal) => `${signal.label}: ${signal.detail}`),
    weakSignals: getChapterQualityPrioritySignals(chapter).map((signal) => ({
      label: signal.label,
      detail: signal.detail,
    })),
  };
}

export function buildFinalRevisionInstructions(
  chapter: EditingChapterSnapshot,
  assessment: EditorialAssessment | null,
  preserveNotes: string[],
) {
  const note = assessment?.chapterNotes.find((entry) => entry.chapterKey === chapter.chapterKey);
  const findings = assessment?.bookWideFindings;
  return [
    `Use approved Quill draft version ${chapter.approvedDraftVersionId ?? "unknown"} as the only source draft for ${chapter.chapterLabel}.`,
    ...(chapter.paragraphOutline ?? []).slice(0, 6).map(
      (paragraph) => `Preserve paragraph anchor ${paragraph.id}: ${paragraph.topicSentence} (${paragraph.purpose}).`,
    ),
    ...(note ? [`Assessment priority: ${note.priority}. ${note.observation}`] : []),
    ...(findings?.preservation ?? []).filter((item) => item.includes(chapter.chapterLabel)).slice(0, 2),
    ...(findings?.citations ?? []).filter((item) => item.includes(chapter.chapterLabel)).slice(0, 2),
    ...(findings?.chapterInstructions ?? []).filter((item) => item.includes(chapter.chapterLabel)).slice(0, 3),
    ...(findings?.voice ?? []).slice(0, 2),
    ...preserveNotes,
  ].filter((item) => item.trim().length > 0).slice(0, 12);
}

function buildGlobalRevisionObjectives(params: {
  chapters: EditingChapterSnapshot[];
  assessment: EditorialAssessment | null;
  focusChapterKey?: string | null;
}) {
  const { chapters, assessment, focusChapterKey } = params;
  const selected = focusChapterKey
    ? chapters.filter((chapter) => chapter.chapterKey === focusChapterKey)
    : chapters;
  const objectives = new Set<string>();

  if (focusChapterKey) {
    objectives.add("Resolve the selected chapter's highest-risk issue without breaking the manuscript's larger arc.");
  } else {
    objectives.add("Improve the highest-leverage chapters first, then preserve book-level coherence across the untouched material.");
    objectives.add("Keep the manuscript voice, pacing, and structural throughline aligned across revision passes.");
  }

  if (assessment?.assessmentSummary) {
    objectives.add(buildExcerpt(assessment.assessmentSummary, 180));
  }

  for (const action of assessment?.nextActions ?? []) {
    objectives.add(buildExcerpt(action, 180));
    if (objectives.size >= 4) {
      break;
    }
  }

  const weakestChapters = [...selected]
    .filter((chapter) => chapter.quality?.needsRevision)
    .sort((a, b) => (a.quality?.score ?? 100) - (b.quality?.score ?? 100))
    .slice(0, 2);
  for (const chapter of weakestChapters) {
    objectives.add(`Lift ${chapter.chapterLabel} above its current ${chapter.quality?.score ?? "unscored"}/100 draft signal while preserving what already works.`);
    objectives.add(`Resolve the pressure inside ${chapter.chapterLabel}: ${buildExcerpt(buildChapterQualityDirective(chapter), 200)}`);
  }

  return Array.from(objectives).slice(0, 5);
}

function buildCoherenceRiskWatchlist(params: {
  chapters: EditingChapterSnapshot[];
  assessment: EditorialAssessment | null;
  focusChapterKey?: string | null;
}) {
  const { chapters, assessment, focusChapterKey } = params;
  const selected = focusChapterKey
    ? chapters.filter((chapter) => chapter.chapterKey === focusChapterKey)
    : chapters;
  const risks = new Set<string>();

  for (const risk of assessment?.risks ?? []) {
    risks.add(buildExcerpt(risk, 180));
    if (risks.size >= 3) {
      break;
    }
  }

  for (const chapter of selected) {
    if (chapter.quality?.needsRevision) {
      risks.add(
        `${chapter.chapterLabel} still carries a ${chapter.quality.readiness} draft signal at ${chapter.quality.score}/100. ${buildExcerpt(buildChapterQualityDirective(chapter), 200)}`,
      );
    }
    if (!chapter.reviewSummary) {
      risks.add(`${chapter.chapterLabel} still lacks a chapter-level editorial review note.`);
    }
    if (risks.size >= 5) {
      break;
    }
  }

  if (!focusChapterKey) {
    const untouchedCount = chapters.length - selected.length;
    if (untouchedCount > 0) {
      risks.add(`Revisions must avoid continuity drift across ${untouchedCount} untouched chapter${untouchedCount === 1 ? "" : "s"}.`);
    }
  }

  return Array.from(risks).slice(0, 5);
}

export function buildDeterministicRevisionPlan(params: {
  chapters: EditingChapterSnapshot[];
  assessment: EditorialAssessment | null;
  focusChapterKey?: string | null;
}): EditorialRevisionPlan {
  const { chapters, assessment, focusChapterKey } = params;
  const selected = focusChapterKey
    ? chapters.filter((chapter) => chapter.chapterKey === focusChapterKey)
    : chapters;
  const noteMap = new Map(
    (assessment?.chapterNotes ?? []).map((note) => [note.chapterKey, note]),
  );

  const chapterQueue = selected
    .map((chapter) => {
      const note = noteMap.get(chapter.chapterKey);
      return {
        chapterKey: chapter.chapterKey,
        chapterLabel: chapter.chapterLabel,
        priority: note?.priority ?? (!chapter.reviewSummary ? "high" : "medium"),
        reason:
          note?.observation ??
          chapter.reviewSummary ??
          "This chapter needs a fresh editorial pass based on the current manuscript state.",
        targetOutcome: buildRevisionTargetOutcome(chapter, note),
        preserveNotes: buildRevisionPreserveNotes(chapter),
        recommendedMode: assessment?.mode ?? "clarity-pass",
      };
    })
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 } as const;
      return rank[a.priority] - rank[b.priority];
    });

  return {
    generatedAt: new Date().toISOString(),
    focus: focusChapterKey ? "chapter-specific" : "whole-book",
    chapterKey: focusChapterKey ?? null,
    summary: focusChapterKey
      ? "Start with the selected chapter, resolve its highest-risk issue, then reassemble the manuscript to see the full-book effect."
      : "Tackle the highest-priority chapters first, then reassemble and run a lighter continuity or voice pass over the full manuscript.",
    globalObjectives: buildGlobalRevisionObjectives({
      chapters,
      assessment,
      focusChapterKey,
    }),
    coherenceRisks: buildCoherenceRiskWatchlist({
      chapters,
      assessment,
      focusChapterKey,
    }),
    passes: [
      "Run the highest-leverage revision first.",
      "Reassemble the manuscript after accepted changes.",
      "Follow with a lighter continuity or voice consistency pass.",
    ],
    chapterQueue,
  };
}

export function modeLabel(mode: EditorialMode) {
  switch (mode) {
    case "structural-edit":
      return "structural edit";
    case "clarity-pass":
      return "clarity pass";
    case "pacing-pass":
      return "pacing pass";
    case "continuity-pass":
      return "continuity pass";
    case "voice-consistency-pass":
      return "voice consistency pass";
    case "line-edit":
      return "line edit";
  }
}
