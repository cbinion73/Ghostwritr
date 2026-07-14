import { Prisma, type StageKey, type StageStatus } from "@prisma/client";

import { parseMetadataRecord } from "@/lib/artifact-schemas";
import { db } from "@/lib/db";

export type FailedChapterProgress = { chapterKey: string; message: string };
export type RecentActivityEntry = { at: string; message: string };

export type StageProgressSnapshot = {
  status: StageStatus | string;
  automationStatus: string | null;
  currentAction: string | null;
  currentChapterKey: string | null;
  totalChapters: number;
  completedChapters: number;
  failedChapters: FailedChapterProgress[];
  provisionalChapters: string[];
  recentActivity: RecentActivityEntry[];
  selectedFormat: string | null;
  errorMessage: string | null;
  lastRunAt: string | null;
};

const OPERATIONAL_KEYS = new Set([
  "automationStatus",
  "currentAction",
  "currentChapterKey",
  "totalChapters",
  "completedChapters",
  "failedChapters",
  "provisionalChapters",
  "recentActivity",
  "selectedFormat",
  "errorMessage",
  "lastRunAt",
  "automationEnabled",
  "automationMode",
]);

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function dateOrNull(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function failedChapters(value: unknown): FailedChapterProgress[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is FailedChapterProgress =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as { chapterKey?: unknown }).chapterKey === "string" &&
          typeof (entry as { message?: unknown }).message === "string",
      )
    : [];
}

function provisionalChapters(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function recentActivity(value: unknown): RecentActivityEntry[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is RecentActivityEntry =>
          Boolean(entry) &&
          typeof entry === "object" &&
          typeof (entry as { at?: unknown }).at === "string" &&
          typeof (entry as { message?: unknown }).message === "string",
      )
    : [];
}

export function hasOperationalMetadata(metadataJson: unknown): boolean {
  const metadata = parseMetadataRecord(metadataJson);
  return Object.keys(metadata).some((key) => OPERATIONAL_KEYS.has(key));
}

export function parseStageProgressFromMetadata(
  metadataJson: unknown,
  status: StageStatus | string = "NOT_STARTED",
): StageProgressSnapshot {
  const metadata = parseMetadataRecord(metadataJson);
  const failed = failedChapters(metadata.failedChapters);
  const total =
    finiteNumber(metadata.totalChapters) > 0
      ? finiteNumber(metadata.totalChapters)
      : status === "READY_FOR_REVIEW" || status === "COMMITTED"
        ? 1
        : 0;
  const completed =
    finiteNumber(metadata.completedChapters) > 0
      ? finiteNumber(metadata.completedChapters)
      : status === "READY_FOR_REVIEW" || status === "COMMITTED"
        ? total || 1
        : 0;

  return {
    status,
    automationStatus: stringOrNull(metadata.automationStatus),
    currentAction: stringOrNull(metadata.currentAction) ?? stringOrNull(metadata.errorMessage),
    currentChapterKey: stringOrNull(metadata.currentChapterKey),
    totalChapters: total,
    completedChapters: completed,
    failedChapters: failed,
    provisionalChapters: provisionalChapters(metadata.provisionalChapters),
    recentActivity: recentActivity(metadata.recentActivity),
    selectedFormat: stringOrNull(metadata.selectedFormat),
    errorMessage: stringOrNull(metadata.errorMessage),
    lastRunAt: stringOrNull(metadata.lastRunAt),
  };
}

export async function syncStageOperationalStateFromMetadata(input: {
  bookId: string;
  stageId: string;
  status?: StageStatus | string;
  metadataJson: unknown;
}) {
  if (!hasOperationalMetadata(input.metadataJson)) return null;
  const metadata = parseMetadataRecord(input.metadataJson);
  const progress = parseStageProgressFromMetadata(input.metadataJson, input.status);

  return db.stageOperationalState.upsert({
    where: { stageId: input.stageId },
    create: {
      bookId: input.bookId,
      stageId: input.stageId,
      automationStatus: progress.automationStatus,
      currentAction: progress.currentAction,
      currentChapterKey: progress.currentChapterKey,
      totalChapters: progress.totalChapters,
      completedChapters: progress.completedChapters,
      failedChapters: progress.failedChapters as unknown as Prisma.InputJsonValue,
      provisionalChapters: progress.provisionalChapters as unknown as Prisma.InputJsonValue,
      recentActivity: progress.recentActivity as unknown as Prisma.InputJsonValue,
      selectedFormat: progress.selectedFormat,
      errorMessage: progress.errorMessage,
      lastRunAt: dateOrNull(metadata.lastRunAt),
      automationEnabled: typeof metadata.automationEnabled === "boolean" ? metadata.automationEnabled : undefined,
      automationMode: stringOrNull(metadata.automationMode),
    },
    update: {
      automationStatus: progress.automationStatus,
      currentAction: progress.currentAction,
      currentChapterKey: progress.currentChapterKey,
      totalChapters: progress.totalChapters,
      completedChapters: progress.completedChapters,
      failedChapters: progress.failedChapters as unknown as Prisma.InputJsonValue,
      provisionalChapters: progress.provisionalChapters as unknown as Prisma.InputJsonValue,
      recentActivity: progress.recentActivity as unknown as Prisma.InputJsonValue,
      selectedFormat: progress.selectedFormat,
      errorMessage: progress.errorMessage,
      lastRunAt: dateOrNull(metadata.lastRunAt),
      automationEnabled: typeof metadata.automationEnabled === "boolean" ? metadata.automationEnabled : undefined,
      automationMode: stringOrNull(metadata.automationMode),
    },
  });
}

export async function getStageProgressForBook(
  bookId: string,
  stageKey: StageKey,
): Promise<StageProgressSnapshot> {
  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId, stageKey } },
    include: { operationalState: true },
  });

  if (!stage) return parseStageProgressFromMetadata({}, "NOT_STARTED");

  const state = stage.operationalState;
  if (!state) return parseStageProgressFromMetadata(stage.metadataJson, stage.status);

  return {
    status: stage.status,
    automationStatus: state.automationStatus,
    currentAction: state.currentAction ?? state.errorMessage,
    currentChapterKey: state.currentChapterKey,
    totalChapters: state.totalChapters,
    completedChapters: state.completedChapters,
    failedChapters: failedChapters(state.failedChapters),
    provisionalChapters: provisionalChapters(state.provisionalChapters),
    recentActivity: recentActivity(state.recentActivity),
    selectedFormat: state.selectedFormat,
    errorMessage: state.errorMessage,
    lastRunAt: state.lastRunAt?.toISOString() ?? null,
  };
}
