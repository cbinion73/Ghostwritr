import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";

import {
  Prisma,
  type Artifact,
  type ArtifactVersion,
  type Book,
  type BookStage,
  type Decision,
  type DirectionEvent,
  type ExternalStoryBinderTab,
  type ExternalStoryClip,
  type ExternalStoryItem,
  type ExternalStorySource,
  type ExternalStoryVerification,
  type ResearchBinderTab,
  type ResearchIdeaClip,
  type ResearchItem,
  type ResearchSource,
  type ResearchVerification,
  type SourceDocument,
  type WorkflowRun,
} from "@prisma/client";
import { z } from "zod";

import { db, withDbRetry } from "./db";
import { ensureDefaultLocalUser } from "./users";

const execFileAsync = promisify(execFile);

const ARCHIVE_VERSION = 1;
const ARCHIVE_MANIFEST_FILE = "book-archive.json";
const REFERENCE_LIBRARY_ROOT = "reference-library/projects";

const ReferenceDocumentArchiveEntrySchema = z.object({
  documentId: z.string(),
  archivePath: z.string(),
  originalFileName: z.string(),
  mimeType: z.string(),
});

const BookArchiveManifestSchema = z.object({
  archiveVersion: z.literal(ARCHIVE_VERSION),
  exportedAt: z.string(),
  book: z.object({
    id: z.string(),
    slug: z.string(),
    titleWorking: z.string().nullable().optional(),
    subtitle: z.string().nullable().optional(),
    status: z.string(),
    workflowType: z.string(),
    metadataJson: z.unknown(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  stages: z.array(z.object({
    id: z.string(),
    stageKey: z.string(),
    status: z.string(),
    activeArtifactVersionId: z.string().nullable().optional(),
    committedArtifactVersionId: z.string().nullable().optional(),
    metadataJson: z.unknown(),
    startedAt: z.string().nullable().optional(),
    committedAt: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
  artifacts: z.array(z.object({
    id: z.string(),
    stageId: z.string(),
    artifactType: z.string(),
    status: z.string(),
    currentVersionId: z.string().nullable().optional(),
    committedVersionId: z.string().nullable().optional(),
    chapterId: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    metadataJson: z.unknown(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
  artifactVersions: z.array(z.object({
    id: z.string(),
    artifactId: z.string(),
    versionNumber: z.number(),
    lifecycleState: z.string(),
    contentJson: z.unknown(),
    contentText: z.string().nullable().optional(),
    summary: z.string().nullable().optional(),
    createdByType: z.string(),
    createdByUserId: z.string().nullable().optional(),
    workflowRunId: z.string().nullable().optional(),
    basedOnVersionIdsJson: z.unknown(),
    promptTemplateVersion: z.string().nullable().optional(),
    modelName: z.string().nullable().optional(),
    committedAt: z.string().nullable().optional(),
    createdAt: z.string(),
  })),
  workflowRuns: z.array(z.object({
    id: z.string(),
    stageId: z.string(),
    runType: z.string(),
    status: z.string(),
    inputJson: z.unknown(),
    outputJson: z.unknown(),
    errorText: z.string().nullable().optional(),
    startedAt: z.string(),
    finishedAt: z.string().nullable().optional(),
  })),
  decisions: z.array(z.object({
    id: z.string(),
    stageId: z.string(),
    artifactId: z.string().nullable().optional(),
    decisionType: z.string(),
    decisionValue: z.string(),
    notes: z.string().nullable().optional(),
    metadataJson: z.unknown(),
    createdByUserId: z.string(),
    createdAt: z.string(),
  })),
  directionEvents: z.array(z.object({
    id: z.string(),
    stageId: z.string(),
    artifactId: z.string().nullable().optional(),
    eventType: z.string(),
    actorType: z.string(),
    actorUserId: z.string().nullable().optional(),
    title: z.string(),
    content: z.string().nullable().optional(),
    metadataJson: z.unknown(),
    createdAt: z.string(),
  })),
  sourceDocuments: z.array(z.object({
    id: z.string(),
    category: z.string(),
    sourceType: z.string(),
    title: z.string(),
    storagePath: z.string(),
    mimeType: z.string(),
    sourceUrl: z.string().nullable().optional(),
    metadataJson: z.unknown(),
    extractedText: z.string().nullable().optional(),
    embeddingState: z.string().nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
  sourceDocumentFiles: z.array(ReferenceDocumentArchiveEntrySchema),
  researchTabs: z.array(z.object({
    id: z.string(),
    stageId: z.string(),
    label: z.string(),
    colorToken: z.string(),
    orderIndex: z.number(),
    chapterKeysJson: z.unknown(),
    metadataJson: z.unknown(),
    isArchived: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
  researchIdeaClips: z.array(z.object({
    id: z.string(),
    stageId: z.string(),
    binderTabId: z.string(),
    chapterKey: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    content: z.string(),
    orderIndex: z.number(),
    metadataJson: z.unknown(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
  researchSources: z.array(z.record(z.string(), z.unknown())),
  researchItems: z.array(z.record(z.string(), z.unknown())),
  researchChecks: z.array(z.record(z.string(), z.unknown())),
  externalStoryTabs: z.array(z.record(z.string(), z.unknown())),
  externalStoryClips: z.array(z.record(z.string(), z.unknown())),
  externalStorySources: z.array(z.record(z.string(), z.unknown())),
  externalStoryItems: z.array(z.record(z.string(), z.unknown())),
  externalStoryChecks: z.array(z.record(z.string(), z.unknown())),
});

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function normalizeJsonValue(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return value === null
    ? (Prisma.JsonNull as unknown as Prisma.InputJsonValue)
    : (value as Prisma.InputJsonValue);
}

async function generateUniqueSlugFromArchive(base: string) {
  const safeBase = sanitizeFileSegment(base.toLowerCase()) || "imported-book";
  let slug = safeBase;
  let suffix = 2;
  while (await db.book.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${safeBase}-${suffix++}`;
  }
  return slug;
}

function mapJsonIds(value: unknown, versionIdMap: Map<string, string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => mapJsonIds(entry, versionIdMap));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const input = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(input)) {
    if (typeof nested === "string" && versionIdMap.has(nested) && /versionid/i.test(key)) {
      next[key] = versionIdMap.get(nested) ?? nested;
      continue;
    }
    next[key] = mapJsonIds(nested, versionIdMap);
  }
  return next;
}

function buildImportedBookMetadata(metadataJson: unknown, sourceSlug: string) {
  const metadata =
    metadataJson && typeof metadataJson === "object"
      ? { ...(metadataJson as Record<string, unknown>) }
      : {};

  return {
    ...metadata,
    importedFrom: sourceSlug,
    importedAt: new Date().toISOString(),
    workflowAutomation: {
      enabled: false,
      mode: "manual",
      lastSummary: {
        status: "manual",
        title: "Archive restored",
        detail: `Imported from archive for ${sourceSlug}. Automation remains manual until you explicitly enable it.`,
        at: new Date().toISOString(),
      },
      history: [],
    },
  } satisfies Prisma.InputJsonValue;
}

function parseArchiveRecord<T extends Record<string, unknown>>(value: T) {
  return value as T & { createdAt?: string; updatedAt?: string };
}

function getReferenceLibraryRoot() {
  return REFERENCE_LIBRARY_ROOT;
}

async function restoreSourceDocumentFile(
  importedBookId: string,
  documentTitle: string,
  archiveRoot: string,
  archiveEntry: z.infer<typeof ReferenceDocumentArchiveEntrySchema> | undefined,
) {
  if (!archiveEntry) {
    return null;
  }

  const sourcePath = path.join(archiveRoot, archiveEntry.archivePath);
  try {
    await access(sourcePath);
  } catch {
    return null;
  }

  const destinationRelative = path.join(
    sanitizeFileSegment(importedBookId),
    "archive-imports",
    `${randomUUID()}-${sanitizeFileSegment(documentTitle || archiveEntry.originalFileName || "document")}`,
  );
  const destinationAbsolute = path.join(getReferenceLibraryRoot(), destinationRelative);
  await mkdir(path.dirname(destinationAbsolute), { recursive: true });
  await cp(sourcePath, destinationAbsolute);
  return destinationAbsolute;
}

export async function importBookArchiveBuffer(input: {
  bytes: Uint8Array;
  fileName?: string;
  ownerUserId?: string;
}) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "ghostwritr-book-import-"));
  const archivePath = path.join(tempDir, input.fileName || "book-archive.zip");
  const extractDir = path.join(tempDir, "bundle");

  try {
    await writeFile(archivePath, input.bytes);
    await mkdir(extractDir, { recursive: true });
    await execFileAsync("unzip", ["-q", archivePath, "-d", extractDir]);

    const manifestRaw = await readFile(path.join(extractDir, ARCHIVE_MANIFEST_FILE), "utf8");
    const manifest = BookArchiveManifestSchema.parse(JSON.parse(manifestRaw));

    const owner =
      input.ownerUserId != null
        ? { id: input.ownerUserId }
        : await ensureDefaultLocalUser();
    const sourceSlug = manifest.book.slug;
    const slug = await generateUniqueSlugFromArchive(`${sourceSlug}-imported`);
    const titleWorking = manifest.book.titleWorking?.trim()
      ? `${manifest.book.titleWorking} (Imported)`
      : `${sourceSlug} (Imported)`;

    const stageIdMap = new Map<string, string>();
    const artifactIdMap = new Map<string, string>();
    const versionIdMap = new Map<string, string>();
    const workflowRunIdMap = new Map<string, string>();
    const binderTabIdMap = new Map<string, string>();
    const externalBinderTabIdMap = new Map<string, string>();
    const sourceRecordIdMap = new Map<string, string>();
    const researchItemIdMap = new Map<string, string>();
    const externalSourceRecordIdMap = new Map<string, string>();
    const externalItemIdMap = new Map<string, string>();

    const imported = await withDbRetry(() =>
      db.$transaction(async (tx) => {
        const book = await tx.book.create({
          data: {
            slug,
            titleWorking,
            subtitle: manifest.book.subtitle ?? null,
            status: manifest.book.status as Book["status"],
            workflowType: manifest.book.workflowType as Book["workflowType"],
            ownerUserId: owner.id,
            metadataJson: buildImportedBookMetadata(manifest.book.metadataJson, sourceSlug),
          },
        });

        for (const stage of manifest.stages) {
          const newStageId = randomUUID();
          stageIdMap.set(stage.id, newStageId);
          await tx.bookStage.create({
            data: {
              id: newStageId,
              bookId: book.id,
              stageKey: stage.stageKey as BookStage["stageKey"],
              status: stage.status as BookStage["status"],
              metadataJson: normalizeJsonValue(stage.metadataJson as Prisma.JsonValue),
              startedAt: stage.startedAt ? new Date(stage.startedAt) : null,
              committedAt: stage.committedAt ? new Date(stage.committedAt) : null,
            },
          });
        }

        for (const run of manifest.workflowRuns) {
          const newRunId = randomUUID();
          workflowRunIdMap.set(run.id, newRunId);
          await tx.workflowRun.create({
            data: {
              id: newRunId,
              bookId: book.id,
              stageId: stageIdMap.get(run.stageId) ?? "",
              runType: run.runType as WorkflowRun["runType"],
              status: run.status as WorkflowRun["status"],
              inputJson: normalizeJsonValue(run.inputJson as Prisma.JsonValue),
              outputJson: normalizeJsonValue(run.outputJson as Prisma.JsonValue),
              errorText: run.errorText ?? null,
              startedAt: new Date(run.startedAt),
              finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
            },
          });
        }

        for (const artifact of manifest.artifacts) {
          const newArtifactId = randomUUID();
          artifactIdMap.set(artifact.id, newArtifactId);
          await tx.artifact.create({
            data: {
              id: newArtifactId,
              bookId: book.id,
              stageId: stageIdMap.get(artifact.stageId) ?? "",
              artifactType: artifact.artifactType as Artifact["artifactType"],
              status: artifact.status as Artifact["status"],
              chapterId: artifact.chapterId ?? null,
              title: artifact.title ?? null,
              summary: artifact.summary ?? null,
              metadataJson: normalizeJsonValue(artifact.metadataJson as Prisma.JsonValue),
            },
          });
        }

        for (const version of manifest.artifactVersions) {
          const newVersionId = randomUUID();
          versionIdMap.set(version.id, newVersionId);
          const remappedContent = mapJsonIds(version.contentJson, versionIdMap);
          const remappedBasedOn = mapJsonIds(version.basedOnVersionIdsJson, versionIdMap);
          await tx.artifactVersion.create({
            data: {
              id: newVersionId,
              artifactId: artifactIdMap.get(version.artifactId) ?? "",
              versionNumber: version.versionNumber,
              lifecycleState: version.lifecycleState as ArtifactVersion["lifecycleState"],
              contentJson: normalizeJsonValue(remappedContent as Prisma.JsonValue),
              contentText: version.contentText ?? null,
              summary: version.summary ?? null,
              createdByType: version.createdByType as ArtifactVersion["createdByType"],
              createdByUserId: version.createdByUserId ? owner.id : null,
              workflowRunId: version.workflowRunId ? workflowRunIdMap.get(version.workflowRunId) ?? null : null,
              basedOnVersionIdsJson: normalizeJsonValue(remappedBasedOn as Prisma.JsonValue),
              promptTemplateVersion: version.promptTemplateVersion ?? null,
              modelName: version.modelName ?? null,
              committedAt: version.committedAt ? new Date(version.committedAt) : null,
              createdAt: new Date(version.createdAt),
            },
          });
        }

        for (const artifact of manifest.artifacts) {
          await tx.artifact.update({
            where: { id: artifactIdMap.get(artifact.id) ?? "" },
            data: {
              currentVersionId: artifact.currentVersionId ? versionIdMap.get(artifact.currentVersionId) ?? null : null,
              committedVersionId: artifact.committedVersionId ? versionIdMap.get(artifact.committedVersionId) ?? null : null,
            },
          });
        }

        for (const stage of manifest.stages) {
          await tx.bookStage.update({
            where: { id: stageIdMap.get(stage.id) ?? "" },
            data: {
              activeArtifactVersionId: stage.activeArtifactVersionId ? versionIdMap.get(stage.activeArtifactVersionId) ?? null : null,
              committedArtifactVersionId: stage.committedArtifactVersionId ? versionIdMap.get(stage.committedArtifactVersionId) ?? null : null,
            },
          });
        }

        for (const decision of manifest.decisions) {
          await tx.decision.create({
            data: {
              id: randomUUID(),
              bookId: book.id,
              stageId: stageIdMap.get(decision.stageId) ?? "",
              artifactId: decision.artifactId ? artifactIdMap.get(decision.artifactId) ?? null : null,
              decisionType: decision.decisionType as Decision["decisionType"],
              decisionValue: decision.decisionValue,
              notes: decision.notes ?? null,
              metadataJson: normalizeJsonValue(decision.metadataJson as Prisma.JsonValue),
              createdByUserId: owner.id,
              createdAt: new Date(decision.createdAt),
            },
          });
        }

        for (const event of manifest.directionEvents) {
          await tx.directionEvent.create({
            data: {
              id: randomUUID(),
              bookId: book.id,
              stageId: stageIdMap.get(event.stageId) ?? "",
              artifactId: event.artifactId ? artifactIdMap.get(event.artifactId) ?? null : null,
              eventType: event.eventType,
              actorType: event.actorType as DirectionEvent["actorType"],
              actorUserId: event.actorUserId ? owner.id : null,
              title: event.title,
              content: event.content ?? null,
              metadataJson: normalizeJsonValue(event.metadataJson as Prisma.JsonValue),
              createdAt: new Date(event.createdAt),
            },
          });
        }

        for (const document of manifest.sourceDocuments) {
          const archiveEntry = manifest.sourceDocumentFiles.find((entry) => entry.documentId === document.id);
          const restoredStoragePath = await restoreSourceDocumentFile(
            book.id,
            document.title,
            extractDir,
            archiveEntry,
          );
          await tx.sourceDocument.create({
            data: {
              id: randomUUID(),
              bookId: book.id,
              category: document.category as SourceDocument["category"],
              sourceType: document.sourceType as SourceDocument["sourceType"],
              title: document.title,
              storagePath: restoredStoragePath ?? document.storagePath,
              mimeType: document.mimeType,
              sourceUrl: document.sourceUrl ?? null,
              metadataJson: normalizeJsonValue(document.metadataJson as Prisma.JsonValue),
              extractedText: document.extractedText ?? null,
              embeddingState: document.embeddingState ?? null,
              createdAt: new Date(document.createdAt),
            },
          });
        }

        for (const tab of manifest.researchTabs) {
          const newId = randomUUID();
          binderTabIdMap.set(tab.id, newId);
          await tx.researchBinderTab.create({
            data: {
              id: newId,
              bookId: book.id,
              stageId: stageIdMap.get(tab.stageId) ?? "",
              label: tab.label,
              colorToken: tab.colorToken,
              orderIndex: tab.orderIndex,
              chapterKeysJson: normalizeJsonValue(tab.chapterKeysJson as Prisma.JsonValue),
              metadataJson: normalizeJsonValue(tab.metadataJson as Prisma.JsonValue),
              isArchived: tab.isArchived,
              createdAt: new Date(tab.createdAt),
            },
          });
        }

        for (const clip of manifest.researchIdeaClips) {
          await tx.researchIdeaClip.create({
            data: {
              id: randomUUID(),
              bookId: book.id,
              stageId: stageIdMap.get(clip.stageId) ?? "",
              binderTabId: binderTabIdMap.get(clip.binderTabId) ?? "",
              chapterKey: clip.chapterKey ?? null,
              title: clip.title ?? null,
              content: clip.content,
              orderIndex: clip.orderIndex,
              metadataJson: normalizeJsonValue(clip.metadataJson as Prisma.JsonValue),
              createdAt: new Date(clip.createdAt),
            },
          });
        }

        for (const source of manifest.researchSources.map(parseArchiveRecord)) {
          const newId = randomUUID();
          sourceRecordIdMap.set(String(source.id), newId);
          await tx.researchSource.create({
            data: {
              id: newId,
              bookId: book.id,
              stageId: stageIdMap.get(String(source.stageId)) ?? "",
              researchArtifactVersionId: source.researchArtifactVersionId ? versionIdMap.get(String(source.researchArtifactVersionId)) ?? null : null,
              chapterKey: String(source.chapterKey),
              url: String(source.url),
              canonicalUrl: source.canonicalUrl ? String(source.canonicalUrl) : null,
              title: String(source.title),
              publisher: source.publisher ? String(source.publisher) : null,
              author: source.author ? String(source.author) : null,
              publishedAt: source.publishedAt ? new Date(String(source.publishedAt)) : null,
              accessedAt: new Date(String(source.accessedAt)),
              contentType: source.contentType ? String(source.contentType) : null,
              sourceTier: source.sourceTier as ResearchSource["sourceTier"],
              tierWeight: new Prisma.Decimal(String(source.tierWeight)),
              isVerified: Boolean(source.isVerified),
              verificationStatus: source.verificationStatus as ResearchSource["verificationStatus"],
              verificationNotes: source.verificationNotes ? String(source.verificationNotes) : null,
              snapshotPath: source.snapshotPath ? String(source.snapshotPath) : null,
              extractedTextPath: source.extractedTextPath ? String(source.extractedTextPath) : null,
              metadataJson: normalizeJsonValue(source.metadataJson as Prisma.JsonValue),
              createdAt: new Date(String(source.createdAt)),
            },
          });
        }

        for (const item of manifest.researchItems.map(parseArchiveRecord)) {
          const newId = randomUUID();
          researchItemIdMap.set(String(item.id), newId);
          await tx.researchItem.create({
            data: {
              id: newId,
              bookId: book.id,
              stageId: stageIdMap.get(String(item.stageId)) ?? "",
              researchArtifactVersionId: item.researchArtifactVersionId ? versionIdMap.get(String(item.researchArtifactVersionId)) ?? null : null,
              sourceRecordId: sourceRecordIdMap.get(String(item.sourceRecordId)) ?? "",
              chapterKey: String(item.chapterKey),
              itemType: item.itemType as ResearchItem["itemType"],
              claimText: String(item.claimText),
              evidenceExcerpt: item.evidenceExcerpt ? String(item.evidenceExcerpt) : null,
              summary: item.summary ? String(item.summary) : null,
              sourceTier: item.sourceTier as ResearchItem["sourceTier"],
              tierWeight: new Prisma.Decimal(String(item.tierWeight)),
              verificationStatus: item.verificationStatus as ResearchItem["verificationStatus"],
              verifiedByRunId: item.verifiedByRunId ? workflowRunIdMap.get(String(item.verifiedByRunId)) ?? null : null,
              relevanceScore: item.relevanceScore ? new Prisma.Decimal(String(item.relevanceScore)) : null,
              confidenceScore: item.confidenceScore ? new Prisma.Decimal(String(item.confidenceScore)) : null,
              mappedSectionId: item.mappedSectionId ? String(item.mappedSectionId) : null,
              mappedChapterId: item.mappedChapterId ? String(item.mappedChapterId) : null,
              mappedParagraphId: item.mappedParagraphId ? String(item.mappedParagraphId) : null,
              metadataJson: normalizeJsonValue(item.metadataJson as Prisma.JsonValue),
              createdAt: new Date(String(item.createdAt)),
            },
          });
        }

        for (const check of manifest.researchChecks.map(parseArchiveRecord)) {
          await tx.researchVerification.create({
            data: {
              id: randomUUID(),
              bookId: book.id,
              stageId: stageIdMap.get(String(check.stageId)) ?? "",
              chapterKey: String(check.chapterKey),
              sourceRecordId: check.sourceRecordId ? sourceRecordIdMap.get(String(check.sourceRecordId)) ?? null : null,
              researchItemId: check.researchItemId ? researchItemIdMap.get(String(check.researchItemId)) ?? null : null,
              verifierType: check.verifierType as ResearchVerification["verifierType"],
              status: check.status as ResearchVerification["status"],
              titleMatch: typeof check.titleMatch === "boolean" ? check.titleMatch : null,
              contentMatch: typeof check.contentMatch === "boolean" ? check.contentMatch : null,
              claimSupported: typeof check.claimSupported === "boolean" ? check.claimSupported : null,
              tierConfirmed: typeof check.tierConfirmed === "boolean" ? check.tierConfirmed : null,
              secondSourceRequired: Boolean(check.secondSourceRequired),
              secondSourceConfirmed: Boolean(check.secondSourceConfirmed),
              notes: check.notes ? String(check.notes) : null,
              metadataJson: normalizeJsonValue(check.metadataJson as Prisma.JsonValue),
              createdAt: new Date(String(check.createdAt)),
            },
          });
        }

        for (const tab of manifest.externalStoryTabs.map(parseArchiveRecord)) {
          const newId = randomUUID();
          externalBinderTabIdMap.set(String(tab.id), newId);
          await tx.externalStoryBinderTab.create({
            data: {
              id: newId,
              bookId: book.id,
              stageId: stageIdMap.get(String(tab.stageId)) ?? "",
              label: String(tab.label),
              colorToken: String(tab.colorToken),
              orderIndex: Number(tab.orderIndex ?? 0),
              chapterKeysJson: normalizeJsonValue(tab.chapterKeysJson as Prisma.JsonValue),
              metadataJson: normalizeJsonValue(tab.metadataJson as Prisma.JsonValue),
              isArchived: Boolean(tab.isArchived),
              createdAt: new Date(String(tab.createdAt)),
            },
          });
        }

        for (const clip of manifest.externalStoryClips.map(parseArchiveRecord)) {
          await tx.externalStoryClip.create({
            data: {
              id: randomUUID(),
              bookId: book.id,
              stageId: stageIdMap.get(String(clip.stageId)) ?? "",
              binderTabId: externalBinderTabIdMap.get(String(clip.binderTabId)) ?? "",
              chapterKey: clip.chapterKey ? String(clip.chapterKey) : null,
              title: clip.title ? String(clip.title) : null,
              content: String(clip.content),
              orderIndex: Number(clip.orderIndex ?? 0),
              metadataJson: normalizeJsonValue(clip.metadataJson as Prisma.JsonValue),
              createdAt: new Date(String(clip.createdAt)),
            },
          });
        }

        for (const source of manifest.externalStorySources.map(parseArchiveRecord)) {
          const newId = randomUUID();
          externalSourceRecordIdMap.set(String(source.id), newId);
          await tx.externalStorySource.create({
            data: {
              id: newId,
              bookId: book.id,
              stageId: stageIdMap.get(String(source.stageId)) ?? "",
              storyArtifactVersionId: source.storyArtifactVersionId ? versionIdMap.get(String(source.storyArtifactVersionId)) ?? null : null,
              chapterKey: String(source.chapterKey),
              url: String(source.url),
              canonicalUrl: source.canonicalUrl ? String(source.canonicalUrl) : null,
              title: String(source.title),
              publisher: source.publisher ? String(source.publisher) : null,
              author: source.author ? String(source.author) : null,
              publishedAt: source.publishedAt ? new Date(String(source.publishedAt)) : null,
              accessedAt: new Date(String(source.accessedAt)),
              contentType: source.contentType ? String(source.contentType) : null,
              sourceTier: source.sourceTier as ExternalStorySource["sourceTier"],
              tierWeight: new Prisma.Decimal(String(source.tierWeight)),
              isVerified: Boolean(source.isVerified),
              verificationStatus: source.verificationStatus as ExternalStorySource["verificationStatus"],
              verificationNotes: source.verificationNotes ? String(source.verificationNotes) : null,
              snapshotPath: source.snapshotPath ? String(source.snapshotPath) : null,
              extractedTextPath: source.extractedTextPath ? String(source.extractedTextPath) : null,
              metadataJson: normalizeJsonValue(source.metadataJson as Prisma.JsonValue),
              createdAt: new Date(String(source.createdAt)),
            },
          });
        }

        for (const item of manifest.externalStoryItems.map(parseArchiveRecord)) {
          const newId = randomUUID();
          externalItemIdMap.set(String(item.id), newId);
          await tx.externalStoryItem.create({
            data: {
              id: newId,
              bookId: book.id,
              stageId: stageIdMap.get(String(item.stageId)) ?? "",
              storyArtifactVersionId: item.storyArtifactVersionId ? versionIdMap.get(String(item.storyArtifactVersionId)) ?? null : null,
              sourceRecordId: externalSourceRecordIdMap.get(String(item.sourceRecordId)) ?? "",
              chapterKey: String(item.chapterKey),
              title: String(item.title),
              summary: String(item.summary),
              whyItMatters: String(item.whyItMatters),
              emotionalRole: String(item.emotionalRole),
              storyType: item.storyType as ExternalStoryItem["storyType"],
              storyFit: item.storyFit as ExternalStoryItem["storyFit"],
              leadershipTheme: item.leadershipTheme ? String(item.leadershipTheme) : null,
              sourceTier: item.sourceTier as ExternalStoryItem["sourceTier"],
              tierWeight: new Prisma.Decimal(String(item.tierWeight)),
              verificationStatus: item.verificationStatus as ExternalStoryItem["verificationStatus"],
              mappedSectionId: item.mappedSectionId ? String(item.mappedSectionId) : null,
              mappedChapterId: item.mappedChapterId ? String(item.mappedChapterId) : null,
              metadataJson: normalizeJsonValue(item.metadataJson as Prisma.JsonValue),
              createdAt: new Date(String(item.createdAt)),
            },
          });
        }

        for (const check of manifest.externalStoryChecks.map(parseArchiveRecord)) {
          await tx.externalStoryVerification.create({
            data: {
              id: randomUUID(),
              bookId: book.id,
              stageId: stageIdMap.get(String(check.stageId)) ?? "",
              chapterKey: String(check.chapterKey),
              sourceRecordId: check.sourceRecordId ? externalSourceRecordIdMap.get(String(check.sourceRecordId)) ?? null : null,
              storyItemId: check.storyItemId ? externalItemIdMap.get(String(check.storyItemId)) ?? null : null,
              verifierType: check.verifierType as ExternalStoryVerification["verifierType"],
              status: check.status as ExternalStoryVerification["status"],
              titleMatch: typeof check.titleMatch === "boolean" ? check.titleMatch : null,
              contentMatch: typeof check.contentMatch === "boolean" ? check.contentMatch : null,
              claimSupported: typeof check.claimSupported === "boolean" ? check.claimSupported : null,
              tierConfirmed: typeof check.tierConfirmed === "boolean" ? check.tierConfirmed : null,
              secondSourceRequired: Boolean(check.secondSourceRequired),
              secondSourceConfirmed: Boolean(check.secondSourceConfirmed),
              notes: check.notes ? String(check.notes) : null,
              metadataJson: normalizeJsonValue(check.metadataJson as Prisma.JsonValue),
              createdAt: new Date(String(check.createdAt)),
            },
          });
        }

        return book;
      }),
    );

    return imported;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
