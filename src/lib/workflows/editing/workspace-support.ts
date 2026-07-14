import { z } from "zod";

import type {
  DraftQualityRollup,
  EditorialAssessment,
  EditorialPreferenceProfile,
  EditorialReadinessGate,
  EditorialRevisionPlan,
  EditorialRevisionPlanExecution,
  EditingChapterSnapshot,
  EditingMessage,
  ManuscriptAssembly,
} from "../../editing-types";

export function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

export function parseEditingMessages(value: unknown): EditingMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is EditingMessage => {
    return Boolean(
      entry &&
        typeof entry === "object" &&
        "role" in entry &&
        "content" in entry &&
        typeof (entry as { role?: unknown }).role === "string" &&
        typeof (entry as { content?: unknown }).content === "string",
    );
  });
}

export function parseJsonWithSchema<T>(value: unknown, schema: z.ZodType<T>): T | null {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const EditorialPreferenceProfileSchema = z.object({
  updatedAt: z.string(),
  styleNotes: z.string(),
  preserveVoice: z.boolean().default(true),
  preferTighterProse: z.boolean().default(true),
  preferBolderCuts: z.boolean().default(false),
  acceptedRevisionCount: z.number().default(0),
  rejectedRevisionCount: z.number().default(0),
  acceptedModes: z
    .array(
      z.enum([
        "structural-edit",
        "clarity-pass",
        "pacing-pass",
        "continuity-pass",
        "voice-consistency-pass",
        "line-edit",
      ]),
    )
    .default([]),
  rejectedModes: z
    .array(
      z.enum([
        "structural-edit",
        "clarity-pass",
        "pacing-pass",
        "continuity-pass",
        "voice-consistency-pass",
        "line-edit",
      ]),
    )
    .default([]),
});

export function getEditorialPreferenceProfile(metadata: Record<string, unknown>): EditorialPreferenceProfile {
  return (
    parseJsonWithSchema(metadata.editorialPreferences, EditorialPreferenceProfileSchema) ?? {
      updatedAt: new Date(0).toISOString(),
      styleNotes: "",
      preserveVoice: true,
      preferTighterProse: true,
      preferBolderCuts: false,
      acceptedRevisionCount: 0,
      rejectedRevisionCount: 0,
      acceptedModes: [],
      rejectedModes: [],
    }
  );
}

export function buildDraftQualityRollup(chapters: EditingChapterSnapshot[]): DraftQualityRollup | null {
  const qualityChapters = chapters.filter(
    (chapter): chapter is EditingChapterSnapshot & { quality: NonNullable<EditingChapterSnapshot["quality"]> } =>
      Boolean(chapter.quality),
  );
  if (qualityChapters.length === 0) {
    return null;
  }

  const averageScore = Math.round(
    qualityChapters.reduce((sum, chapter) => sum + chapter.quality.score, 0) / qualityChapters.length,
  );
  const chaptersNeedingRevision = qualityChapters.filter((chapter) => chapter.quality.needsRevision).length;
  const strongChapters = qualityChapters.filter((chapter) => chapter.quality.readiness === "strong").length;
  const watchChapters = qualityChapters.filter((chapter) => chapter.quality.readiness === "watch").length;
  const attentionChapters = qualityChapters.filter(
    (chapter) => chapter.quality.readiness === "needs attention",
  ).length;
  const totalRevisionPasses = qualityChapters.reduce(
    (sum, chapter) => sum + chapter.quality.revisionPasses,
    0,
  );
  const weakestChapter =
    [...qualityChapters].sort((a, b) => a.quality.score - b.quality.score)[0] ?? null;

  return {
    averageScore,
    chaptersNeedingRevision,
    strongChapters,
    watchChapters,
    attentionChapters,
    totalRevisionPasses,
    weakestChapterLabel: weakestChapter?.chapterLabel ?? null,
    headline:
      chaptersNeedingRevision === 0
        ? `Draft quality is stable across ${qualityChapters.length} chapters.`
        : `${chaptersNeedingRevision} chapter${chaptersNeedingRevision === 1 ? "" : "s"} still need another draft pass before the editorial finish is truly clean.`,
    blockers: qualityChapters
      .filter((chapter) => chapter.quality.needsRevision)
      .slice(0, 4)
      .map(
        (chapter) =>
          `${chapter.chapterLabel} is at ${chapter.quality.score}/100 with ${chapter.quality.readiness} readiness. ${buildExcerpt(describeChapterQualityHotspots(chapter), 160)}`,
      ),
  };
}

function describeChapterQualityHotspots(chapter: EditingChapterSnapshot) {
  const weakSignals = (chapter.quality?.signals ?? []).filter((signal) => signal.state !== "pass");
  if (weakSignals.length === 0) {
    return chapter.reviewSummary ?? "No major quality hotspots are currently recorded.";
  }

  return weakSignals
    .slice(0, 3)
    .map((signal) => `${signal.label}: ${signal.detail}`)
    .join(" ");
}

export function buildExcerpt(text: string, maxLength = 400) {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength).trimEnd()}...`;
}

export function computeEditorialReadinessGate(params: {
  manuscript: ManuscriptAssembly | null;
  draftQualityRollup: DraftQualityRollup | null;
  latestAssessment: EditorialAssessment | null;
  revisionPlan: EditorialRevisionPlan | null;
  revisionPlanExecution: EditorialRevisionPlanExecution | null;
  appliedRevisionIds: string[];
  rejectedRevisionIds: string[];
  bookTargetWordCount?: number | null;
  bookTargetTolerance?: number | null;
}): EditorialReadinessGate {
  const {
    manuscript,
    draftQualityRollup,
    latestAssessment,
    revisionPlan,
    revisionPlanExecution,
    appliedRevisionIds,
    rejectedRevisionIds,
    bookTargetWordCount,
    bookTargetTolerance,
  } = params;

  if (!manuscript) {
    return {
      evaluatedAt: new Date().toISOString(),
      score: 0,
      recommendation: "blocked",
      strengths: [],
      risks: ["The full manuscript has not been assembled yet."],
      nextActions: ["Assemble the manuscript before asking the editor agent to commit the stage."],
    };
  }

  let score = 52;
  const strengths: string[] = [];
  const risks: string[] = [];
  const nextActions: string[] = [];

  if (manuscript.chapterCount > 0) {
    strengths.push(`The manuscript is assembled across ${manuscript.chapterCount} drafted chapters.`);
    score += 10;
  }

  if (manuscript.totalWords > 0) {
    strengths.push(`The current assembly contains ${manuscript.totalWords.toLocaleString()} words of prose.`);
    score += 8;
  }

  if (bookTargetWordCount && bookTargetWordCount > 0) {
    const tolerance = Math.max(500, bookTargetTolerance ?? 0);
    const minimumTarget = Math.max(0, bookTargetWordCount - tolerance);
    const maximumTarget = bookTargetWordCount + tolerance;
    if (manuscript.totalWords < minimumTarget || manuscript.totalWords > maximumTarget) {
      const delta = manuscript.totalWords - bookTargetWordCount;
      risks.push(
        `The assembled manuscript is ${Math.abs(delta).toLocaleString()} words ${delta > 0 ? "over" : "under"} the requested ${bookTargetWordCount.toLocaleString()}-word target.`,
      );
      nextActions.push("Run another draft-length pass before treating Editing as final.");
      score -= Math.abs(delta) > Math.max(4000, Math.round(bookTargetWordCount * 0.2)) ? 22 : 12;
    } else {
      strengths.push(
        `The assembled manuscript is inside the requested ${minimumTarget.toLocaleString()}-${maximumTarget.toLocaleString()} word range.`,
      );
      score += 6;
    }
  }

  if (draftQualityRollup) {
    strengths.push(`Draft quality signals average ${draftQualityRollup.averageScore}/100 across the manuscript.`);
    score += Math.round((draftQualityRollup.averageScore - 50) / 4);

    if (draftQualityRollup.chaptersNeedingRevision > 0) {
      risks.push(
        `${draftQualityRollup.chaptersNeedingRevision} chapter${draftQualityRollup.chaptersNeedingRevision === 1 ? "" : "s"} still carry draft-level revision flags.`,
      );
      nextActions.push("Use the draft quality blockers to target the weakest chapters before final commit.");
      score -= draftQualityRollup.chaptersNeedingRevision >= 3 ? 14 : 8;
    } else {
      strengths.push("No chapter is currently flagged as needing another draft pass.");
      score += 5;
    }

    if (draftQualityRollup.weakestChapterLabel) {
      strengths.push(`Weakest visible chapter signal: ${draftQualityRollup.weakestChapterLabel}.`);
    }
  }

  if ((latestAssessment?.strengths.length ?? 0) > 0) {
    strengths.push("A structured editorial assessment already exists for the current manuscript.");
    score += 6;
  } else {
    risks.push("No editorial assessment has been generated for the current manuscript assembly yet.");
    nextActions.push("Run an editorial assessment before committing the Editing stage.");
    score -= 16;
  }

  const outstandingConcerns = manuscript.outstandingConcerns.length;
  if (outstandingConcerns === 0) {
    strengths.push("No outstanding concerns are currently attached to the assembly.");
    score += 6;
  } else if (outstandingConcerns <= 2) {
    risks.push(`${outstandingConcerns} editorial concern(s) are still attached to the current assembly.`);
    nextActions.push("Resolve the remaining editorial concerns or accept them explicitly before commit.");
    score -= 6;
  } else {
    risks.push(`${outstandingConcerns} editorial concerns are still attached to the current assembly.`);
    nextActions.push("Run another revision pass before committing the Editing stage.");
    score -= 14;
  }

  const assessmentRiskCount = latestAssessment?.risks.length ?? 0;
  if (assessmentRiskCount >= 4) {
    risks.push(`The latest assessment still lists ${assessmentRiskCount} material editorial risks.`);
    nextActions.push("Use the revision plan to reduce the highest-risk chapters before commit.");
    score -= 18;
  } else if (assessmentRiskCount > 0) {
    risks.push(`The latest assessment still lists ${assessmentRiskCount} editorial risk(s).`);
    score -= 8;
  } else if (latestAssessment) {
    strengths.push("The latest assessment does not list explicit editorial risks.");
    score += 5;
  }

  if (revisionPlan && revisionPlan.chapterQueue.length > 0) {
    strengths.push(`A revision plan exists with ${revisionPlan.chapterQueue.length} queued item(s).`);
    score += 4;
  }

  if (revisionPlanExecution) {
    strengths.push(
      `The editorial loop has already executed ${revisionPlanExecution.generatedCount} planned revision item(s).`,
    );
    score += 8;
    if (revisionPlanExecution.autoAppliedCount > 0) {
      strengths.push(
        `${revisionPlanExecution.autoAppliedCount} revision(s) have already been auto-applied back into the manuscript.`,
      );
      score += 4;
    }
  }

  if (appliedRevisionIds.length > 0) {
    strengths.push(`${appliedRevisionIds.length} accepted revision(s) are reflected in manuscript history.`);
    score += 5;
  }

  if (rejectedRevisionIds.length >= 3 && appliedRevisionIds.length === 0) {
    risks.push("Several revisions have been rejected without any accepted alternatives yet.");
    nextActions.push("Generate a narrower revision mode or save editor preferences before the next pass.");
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  const recommendation =
    !latestAssessment ||
    assessmentRiskCount >= 5 ||
    outstandingConcerns >= 4 ||
    (draftQualityRollup?.chaptersNeedingRevision ?? 0) >= 4 ||
    (bookTargetWordCount != null &&
      bookTargetWordCount > 0 &&
      manuscript.totalWords <
        Math.max(0, bookTargetWordCount - Math.max(500, bookTargetTolerance ?? 0)))
      ? "blocked"
      : score >= 78
        ? "ready_for_commit"
        : "needs_revision";

  if (recommendation === "ready_for_commit") {
    nextActions.push("The editorial state is strong enough to commit Editing and refresh the publishing package.");
  } else if (recommendation === "needs_revision") {
    nextActions.push("Run one more targeted revision pass before committing.");
  }

  return {
    evaluatedAt: new Date().toISOString(),
    score,
    recommendation,
    strengths: strengths.slice(0, 5),
    risks: risks.slice(0, 5),
    nextActions: [...new Set(nextActions)].slice(0, 5),
  };
}
