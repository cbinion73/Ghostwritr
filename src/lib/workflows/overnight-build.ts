import { StageKey, StageStatus } from "@prisma/client";

import { db } from "../db";
import { parseMetadataRecord } from "../artifact-schemas";
import { getBookBySlugOrThrow, updateBookMetadata } from "../repositories/books";
import {
  runWorkflowAutopilot,
  setWorkflowAutomationMode,
} from "./workflow-automation";

/**
 * The Overnight Build — one-click "Write the Book".
 *
 * Wraps the existing autopilot machinery (continuous mode: every finished
 * background worker re-triggers the next step via
 * continueWorkflowAutomationIfEnabled) with:
 *   - a recorded build session (startedAt) in book metadata
 *   - a Morning Report generated when the build reaches a resting state:
 *     what was produced, what it cost, and exactly what needs the author's
 *     judgment next.
 *
 * No schema changes — session + report live in book.metadataJson so this
 * deploys without a migration.
 */

export type MorningReport = {
  generatedAt: string;
  startedAt: string;
  outcome: "complete" | "waiting_on_you" | "blocked" | "in_progress";
  headline: string;
  chaptersDrafted: number;
  totalChapters: number;
  wordsWritten: number;
  weakChapters: Array<{ chapterKey: string; chapterTitle: string; score: number }>;
  stagesCommitted: string[];
  needsJudgment: Array<{ stage: string; reason: string }>;
  spendUsd: number;
  llmCalls: number;
  history: Array<{ title: string; detail: string; at: string }>;
};

type OvernightState = {
  active: boolean;
  startedAt: string | null;
  report: MorningReport | null;
  reportAcknowledgedAt: string | null;
};

export function getOvernightState(metadata: unknown): OvernightState {
  const record = parseMetadataRecord(metadata);
  const raw =
    record.overnightBuild && typeof record.overnightBuild === "object"
      ? (record.overnightBuild as Record<string, unknown>)
      : null;
  return {
    active: Boolean(raw?.active),
    startedAt: typeof raw?.startedAt === "string" ? raw.startedAt : null,
    report: raw?.report && typeof raw.report === "object" ? (raw.report as MorningReport) : null,
    reportAcknowledgedAt:
      typeof raw?.reportAcknowledgedAt === "string" ? raw.reportAcknowledgedAt : null,
  };
}

async function writeOvernightState(bookId: string, metadata: unknown, next: Partial<OvernightState>) {
  const record = parseMetadataRecord(metadata);
  const current = getOvernightState(metadata);
  await updateBookMetadata(bookId, {
    ...record,
    overnightBuild: {
      active: next.active ?? current.active,
      startedAt: next.startedAt !== undefined ? next.startedAt : current.startedAt,
      report: next.report !== undefined ? next.report : current.report,
      reportAcknowledgedAt:
        next.reportAcknowledgedAt !== undefined
          ? next.reportAcknowledgedAt
          : current.reportAcknowledgedAt,
    },
  });
}

/** Kick off the overnight build: continuous autopilot + session marker. */
export async function startOvernightBuild(
  bookSlug: string,
  trigger: (runId: string) => void,
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  await writeOvernightState(book.id, book.metadataJson, {
    active: true,
    startedAt: new Date().toISOString(),
    report: null,
    reportAcknowledgedAt: null,
  });
  await setWorkflowAutomationMode(bookSlug, "continuous");
  return runWorkflowAutopilot(bookSlug, trigger, "continuous");
}

/** Stop the build without a report (author intervened). */
export async function stopOvernightBuild(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  await setWorkflowAutomationMode(bookSlug, "manual");
  await writeOvernightState(book.id, book.metadataJson, { active: false });
}

export async function acknowledgeMorningReport(bookSlug: string) {
  const book = await getBookBySlugOrThrow(bookSlug);
  await writeOvernightState(book.id, book.metadataJson, {
    reportAcknowledgedAt: new Date().toISOString(),
  });
}

/**
 * Called after every autopilot continuation. When the build has reached a
 * resting state (nothing left to launch: complete, waiting on a human
 * boundary, or blocked), generate the Morning Report and end the session.
 */
export async function maybeFinalizeOvernightBuild(
  bookSlug: string,
  automationStatus: "advanced" | "launched" | "waiting" | "manual" | "complete" | "error",
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const state = getOvernightState(book.metadataJson);
  if (!state.active) return null;

  // Still making progress — a worker is running or another step just launched.
  if (automationStatus === "advanced" || automationStatus === "launched" || automationStatus === "waiting") {
    return null;
  }

  const report = await generateMorningReport(bookSlug, state.startedAt ?? new Date(0).toISOString());
  await writeOvernightState(book.id, book.metadataJson, {
    active: false,
    report,
    reportAcknowledgedAt: null,
  });
  if (automationStatus === "manual" || automationStatus === "error") {
    await setWorkflowAutomationMode(bookSlug, "manual");
  }
  return report;
}

/** Compile the Morning Report from real build outputs. */
export async function generateMorningReport(
  bookSlug: string,
  startedAtIso: string,
): Promise<MorningReport> {
  const book = await getBookBySlugOrThrow(bookSlug);
  const startedAt = new Date(startedAtIso);

  const [stages, spend, draftArtifacts] = await Promise.all([
    db.bookStage.findMany({
      where: { bookId: book.id },
      select: { stageKey: true, status: true, committedAt: true, metadataJson: true },
    }),
    db.lLMCallLog.aggregate({
      where: { bookId: book.id, createdAt: { gte: startedAt } },
      _sum: { costUsd: true },
      _count: { id: true },
    }),
    db.artifact.findMany({
      where: { bookId: book.id, artifactType: "CHAPTER_DRAFT" },
      select: {
        title: true,
        metadataJson: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: { contentJson: true },
        },
      },
    }),
  ]);

  const stagesCommitted = stages
    .filter((s) => s.committedAt && s.committedAt >= startedAt)
    .map((s) => s.stageKey.replace(/_/g, " "));

  let chaptersDrafted = 0;
  let wordsWritten = 0;
  const weakChapters: MorningReport["weakChapters"] = [];
  for (const artifact of draftArtifacts) {
    const bundle = artifact.versions[0]?.contentJson as
      | { chapterKey?: string; chapterTitle?: string; chapterText?: string; quality?: { score?: number; needsRevision?: boolean } }
      | null;
    if (!bundle?.chapterText?.trim()) continue;
    chaptersDrafted += 1;
    wordsWritten += bundle.chapterText.split(/\s+/).filter(Boolean).length;
    const score = bundle.quality?.score ?? 0;
    if (bundle.quality?.needsRevision || score < 65) {
      weakChapters.push({
        chapterKey: bundle.chapterKey ?? "",
        chapterTitle: bundle.chapterTitle ?? artifact.title ?? "Untitled chapter",
        score,
      });
    }
  }

  const needsJudgment: MorningReport["needsJudgment"] = [];
  const boundaryHints: Partial<Record<StageKey, string>> = {
    [StageKey.BOOK_SETUP]: "Book Setup needs your voice, targets, and guardrails before anything downstream can run.",
    [StageKey.PROMISE]: "Promise is a human-shaped strategic stage. Review and commit it to unlock the build.",
    [StageKey.OUTLINE]: "The outline is your approval boundary — commit it so drafting knows the chapter list.",
    [StageKey.PERSONAL_STORIES]: "Personal Stories needs your lived material. Answer the interview to keep the book human.",
  };
  for (const stage of stages) {
    if (stage.status === StageStatus.READY_FOR_REVIEW) {
      needsJudgment.push({
        stage: stage.stageKey.replace(/_/g, " "),
        reason: "Generated and waiting for your review + commit.",
      });
    } else if (stage.status === StageStatus.BLOCKED) {
      needsJudgment.push({
        stage: stage.stageKey.replace(/_/g, " "),
        reason: "Blocked — open the stage to see the diagnosis.",
      });
    } else if (stage.status === StageStatus.NOT_STARTED) {
      const hint = boundaryHints[stage.stageKey];
      if (hint) {
        needsJudgment.push({ stage: stage.stageKey.replace(/_/g, " "), reason: hint });
      }
    }
  }
  for (const weak of weakChapters) {
    needsJudgment.push({
      stage: "CHAPTER DRAFT",
      reason: `${weak.chapterTitle} scored ${weak.score}/100 after repair passes — worth a personal read.`,
    });
  }

  const automation = parseMetadataRecord(book.metadataJson).workflowAutomation as
    | { history?: Array<{ title?: string; detail?: string; at?: string }> }
    | undefined;
  const history = (automation?.history ?? [])
    .filter((entry) => entry.at && new Date(entry.at) >= startedAt)
    .map((entry) => ({
      title: entry.title ?? "",
      detail: entry.detail ?? "",
      at: entry.at ?? "",
    }));

  const editingCommitted = stages.some(
    (s) => s.stageKey === StageKey.EDITING && s.status === StageStatus.COMMITTED,
  );
  const blocked = needsJudgment.some((item) => item.reason.startsWith("Blocked"));
  const outcome: MorningReport["outcome"] = editingCommitted
    ? "complete"
    : blocked
      ? "blocked"
      : needsJudgment.length > 0
        ? "waiting_on_you"
        : "in_progress";

  const headline =
    outcome === "complete"
      ? `The manuscript is written: ${chaptersDrafted} chapters, ${wordsWritten.toLocaleString()} words, edited and committed.`
      : outcome === "blocked"
        ? "The build hit a blocker and needs your attention before it can continue."
        : chaptersDrafted > 0
          ? `${chaptersDrafted} chapters (${wordsWritten.toLocaleString()} words) are drafted — ${needsJudgment.length} item${needsJudgment.length === 1 ? "" : "s"} need your judgment.`
          : "The build advanced the workflow and stopped at a stage that needs you.";

  return {
    generatedAt: new Date().toISOString(),
    startedAt: startedAtIso,
    outcome,
    headline,
    chaptersDrafted,
    totalChapters: draftArtifacts.length,
    wordsWritten,
    weakChapters,
    stagesCommitted,
    needsJudgment,
    spendUsd: Number(spend._sum.costUsd ?? 0),
    llmCalls: spend._count.id,
    history,
  };
}
