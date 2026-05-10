import { execFile } from "child_process";
import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";

import type { Prisma } from "@prisma/client";

import { db, withDbRetry } from "./db";
import { contentDisposition } from "./manuscript-export";

const execFileAsync = promisify(execFile);

const ARCHIVE_VERSION = 1;
const ARCHIVE_MANIFEST_FILE = "book-archive.json";

type ReferenceDocumentArchiveEntry = {
  documentId: string;
  archivePath: string;
  originalFileName: string;
  mimeType: string;
};

type BookArchiveManifest = {
  archiveVersion: typeof ARCHIVE_VERSION;
  exportedAt: string;
  book: {
    id: string;
    slug: string;
    titleWorking: string | null;
    subtitle: string | null;
    status: string;
    workflowType: string;
    metadataJson: Prisma.JsonValue | null;
    createdAt: string;
    updatedAt: string;
  };
  stages: Array<{
    id: string;
    stageKey: string;
    status: string;
    activeArtifactVersionId: string | null;
    committedArtifactVersionId: string | null;
    metadataJson: Prisma.JsonValue | null;
    startedAt: string | null;
    committedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  artifacts: Array<{
    id: string;
    stageId: string;
    artifactType: string;
    status: string;
    currentVersionId: string | null;
    committedVersionId: string | null;
    title: string | null;
    summary: string | null;
    metadataJson: Prisma.JsonValue | null;
    createdAt: string;
    updatedAt: string;
  }>;
  artifactVersions: Array<{
    id: string;
    artifactId: string;
    versionNumber: number;
    lifecycleState: string;
    contentJson: Prisma.JsonValue | null;
    contentText: string | null;
    summary: string | null;
    createdByType: string;
    createdByUserId: string | null;
    workflowRunId: string | null;
    basedOnVersionIdsJson: Prisma.JsonValue | null;
    promptTemplateVersion: string | null;
    modelName: string | null;
    committedAt: string | null;
    createdAt: string;
  }>;
  workflowRuns: Array<{
    id: string;
    stageId: string;
    runType: string;
    status: string;
    inputJson: Prisma.JsonValue | null;
    outputJson: Prisma.JsonValue | null;
    errorText: string | null;
    startedAt: string;
    finishedAt: string | null;
  }>;
  decisions: Array<{
    id: string;
    stageId: string;
    artifactId: string | null;
    decisionType: string;
    decisionValue: string;
    notes: string | null;
    metadataJson: Prisma.JsonValue | null;
    createdByUserId: string;
    createdAt: string;
  }>;
  directionEvents: Array<{
    id: string;
    stageId: string;
    artifactId: string | null;
    eventType: string;
    actorType: string;
    actorUserId: string | null;
    title: string;
    content: string | null;
    metadataJson: Prisma.JsonValue | null;
    createdAt: string;
  }>;
  sourceDocuments: Array<{
    id: string;
    category: string;
    sourceType: string;
    title: string;
    storagePath: string;
    mimeType: string;
    sourceUrl: string | null;
    metadataJson: Prisma.JsonValue | null;
    extractedText: string | null;
    embeddingState: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  sourceDocumentFiles: ReferenceDocumentArchiveEntry[];
  researchTabs: Array<Record<string, unknown>>;
  researchIdeaClips: Array<Record<string, unknown>>;
  researchSources: Array<Record<string, unknown>>;
  researchItems: Array<Record<string, unknown>>;
  researchChecks: Array<Record<string, unknown>>;
  externalStoryTabs: Array<Record<string, unknown>>;
  externalStoryClips: Array<Record<string, unknown>>;
  externalStorySources: Array<Record<string, unknown>>;
  externalStoryItems: Array<Record<string, unknown>>;
  externalStoryChecks: Array<Record<string, unknown>>;
};

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function asArchiveDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

async function loadBookArchiveGraph(slug: string) {
  const book = await db.book.findUnique({
    where: { slug },
  });

  if (!book) {
    throw new Error(`Book not found for slug "${slug}"`);
  }

  const [
    stages,
    artifacts,
    artifactVersions,
    workflowRuns,
    decisions,
    directionEvents,
    sourceDocuments,
    researchTabs,
    researchIdeaClips,
    researchSources,
    researchItems,
    researchChecks,
    externalStoryTabs,
    externalStoryClips,
    externalStorySources,
    externalStoryItems,
    externalStoryChecks,
  ] = await Promise.all([
    db.bookStage.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" } }),
    db.artifact.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" } }),
    db.artifactVersion.findMany({
      where: { artifact: { bookId: book.id } },
      orderBy: [{ artifactId: "asc" }, { versionNumber: "asc" }],
    }),
    db.workflowRun.findMany({ where: { bookId: book.id }, orderBy: { startedAt: "asc" } }),
    db.decision.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" } }),
    db.directionEvent.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" } }),
    db.sourceDocument.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" } }),
    db.researchBinderTab.findMany({ where: { bookId: book.id }, orderBy: { orderIndex: "asc" } }),
    db.researchIdeaClip.findMany({ where: { bookId: book.id }, orderBy: [{ binderTabId: "asc" }, { orderIndex: "asc" }] }),
    db.researchSource.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" } }),
    db.researchItem.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" } }),
    db.researchVerification.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" } }),
    db.externalStoryBinderTab.findMany({ where: { bookId: book.id }, orderBy: { orderIndex: "asc" } }),
    db.externalStoryClip.findMany({ where: { bookId: book.id }, orderBy: [{ binderTabId: "asc" }, { orderIndex: "asc" }] }),
    db.externalStorySource.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" } }),
    db.externalStoryItem.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" } }),
    db.externalStoryVerification.findMany({ where: { bookId: book.id }, orderBy: { createdAt: "asc" } }),
  ]);

  return {
    book,
    stages,
    artifacts,
    artifactVersions,
    workflowRuns,
    decisions,
    directionEvents,
    sourceDocuments,
    researchTabs,
    researchIdeaClips,
    researchSources,
    researchItems,
    researchChecks,
    externalStoryTabs,
    externalStoryClips,
    externalStorySources,
    externalStoryItems,
    externalStoryChecks,
  };
}

function serializeManifest(
  graph: Awaited<ReturnType<typeof loadBookArchiveGraph>>,
  sourceDocumentFiles: ReferenceDocumentArchiveEntry[],
): BookArchiveManifest {
  return {
    archiveVersion: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    book: {
      id: graph.book.id,
      slug: graph.book.slug,
      titleWorking: graph.book.titleWorking ?? null,
      subtitle: graph.book.subtitle ?? null,
      status: graph.book.status,
      workflowType: graph.book.workflowType,
      metadataJson: graph.book.metadataJson,
      createdAt: graph.book.createdAt.toISOString(),
      updatedAt: graph.book.updatedAt.toISOString(),
    },
    stages: graph.stages.map((stage) => ({
      id: stage.id,
      stageKey: stage.stageKey,
      status: stage.status,
      activeArtifactVersionId: stage.activeArtifactVersionId ?? null,
      committedArtifactVersionId: stage.committedArtifactVersionId ?? null,
      metadataJson: stage.metadataJson,
      startedAt: asArchiveDate(stage.startedAt),
      committedAt: asArchiveDate(stage.committedAt),
      createdAt: stage.createdAt.toISOString(),
      updatedAt: stage.updatedAt.toISOString(),
    })),
    artifacts: graph.artifacts.map((artifact) => ({
      id: artifact.id,
      stageId: artifact.stageId,
      artifactType: artifact.artifactType,
      status: artifact.status,
      currentVersionId: artifact.currentVersionId ?? null,
      committedVersionId: artifact.committedVersionId ?? null,
      title: artifact.title ?? null,
      summary: artifact.summary ?? null,
      metadataJson: artifact.metadataJson,
      createdAt: artifact.createdAt.toISOString(),
      updatedAt: artifact.updatedAt.toISOString(),
    })),
    artifactVersions: graph.artifactVersions.map((version) => ({
      id: version.id,
      artifactId: version.artifactId,
      versionNumber: version.versionNumber,
      lifecycleState: version.lifecycleState,
      contentJson: version.contentJson,
      contentText: version.contentText ?? null,
      summary: version.summary ?? null,
      createdByType: version.createdByType,
      createdByUserId: version.createdByUserId ?? null,
      workflowRunId: version.workflowRunId ?? null,
      basedOnVersionIdsJson: version.basedOnVersionIdsJson,
      promptTemplateVersion: version.promptTemplateVersion ?? null,
      modelName: version.modelName ?? null,
      committedAt: asArchiveDate(version.committedAt),
      createdAt: version.createdAt.toISOString(),
    })),
    workflowRuns: graph.workflowRuns.map((run) => ({
      id: run.id,
      stageId: run.stageId,
      runType: run.runType,
      status: run.status,
      inputJson: run.inputJson,
      outputJson: run.outputJson,
      errorText: run.errorText ?? null,
      startedAt: run.startedAt.toISOString(),
      finishedAt: asArchiveDate(run.finishedAt),
    })),
    decisions: graph.decisions.map((decision) => ({
      id: decision.id,
      stageId: decision.stageId,
      artifactId: decision.artifactId ?? null,
      decisionType: decision.decisionType,
      decisionValue: decision.decisionValue,
      notes: decision.notes ?? null,
      metadataJson: decision.metadataJson,
      createdByUserId: decision.createdByUserId,
      createdAt: decision.createdAt.toISOString(),
    })),
    directionEvents: graph.directionEvents.map((event) => ({
      id: event.id,
      stageId: event.stageId,
      artifactId: event.artifactId ?? null,
      eventType: event.eventType,
      actorType: event.actorType,
      actorUserId: event.actorUserId ?? null,
      title: event.title,
      content: event.content ?? null,
      metadataJson: event.metadataJson,
      createdAt: event.createdAt.toISOString(),
    })),
    sourceDocuments: graph.sourceDocuments.map((document) => ({
      id: document.id,
      category: document.category,
      sourceType: document.sourceType,
      title: document.title,
      storagePath: document.storagePath,
      mimeType: document.mimeType,
      sourceUrl: document.sourceUrl ?? null,
      metadataJson: document.metadataJson,
      extractedText: document.extractedText ?? null,
      embeddingState: document.embeddingState ?? null,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    })),
    sourceDocumentFiles,
    researchTabs: graph.researchTabs.map((tab) => ({
      id: tab.id,
      stageId: tab.stageId,
      label: tab.label,
      colorToken: tab.colorToken,
      orderIndex: tab.orderIndex,
      chapterKeysJson: tab.chapterKeysJson,
      metadataJson: tab.metadataJson,
      isArchived: tab.isArchived,
      createdAt: tab.createdAt.toISOString(),
      updatedAt: tab.updatedAt.toISOString(),
    })),
    researchIdeaClips: graph.researchIdeaClips.map((clip) => ({
      id: clip.id,
      stageId: clip.stageId,
      binderTabId: clip.binderTabId,
      chapterKey: clip.chapterKey ?? null,
      title: clip.title ?? null,
      content: clip.content,
      orderIndex: clip.orderIndex,
      metadataJson: clip.metadataJson,
      createdAt: clip.createdAt.toISOString(),
      updatedAt: clip.updatedAt.toISOString(),
    })),
    researchSources: graph.researchSources as Array<Record<string, unknown>>,
    researchItems: graph.researchItems as Array<Record<string, unknown>>,
    researchChecks: graph.researchChecks as Array<Record<string, unknown>>,
    externalStoryTabs: graph.externalStoryTabs as Array<Record<string, unknown>>,
    externalStoryClips: graph.externalStoryClips as Array<Record<string, unknown>>,
    externalStorySources: graph.externalStorySources as Array<Record<string, unknown>>,
    externalStoryItems: graph.externalStoryItems as Array<Record<string, unknown>>,
    externalStoryChecks: graph.externalStoryChecks as Array<Record<string, unknown>>,
  };
}

export async function createBookArchive(slug: string) {
  const graph = await withDbRetry(() => loadBookArchiveGraph(slug));
  const tempDir = await mkdtemp(path.join(tmpdir(), "ghostwritr-book-archive-"));
  const bundleDir = path.join(tempDir, "bundle");
  const sourceDocsDir = path.join(bundleDir, "source-documents");

  try {
    await mkdir(sourceDocsDir, { recursive: true });

    const sourceDocumentFiles: ReferenceDocumentArchiveEntry[] = [];
    for (const document of graph.sourceDocuments) {
      try {
        await access(document.storagePath);
        const archiveFileName = `${document.id}-${sanitizeFileSegment(document.title || "document")}`;
        const archivePath = path.join("source-documents", archiveFileName);
        await cp(document.storagePath, path.join(bundleDir, archivePath));
        sourceDocumentFiles.push({
          documentId: document.id,
          archivePath,
          originalFileName: path.basename(document.storagePath),
          mimeType: document.mimeType,
        });
      } catch {
        // Skip missing local files but preserve the document metadata in the manifest.
      }
    }

    const manifest = serializeManifest(graph, sourceDocumentFiles);
    await writeFile(
      path.join(bundleDir, ARCHIVE_MANIFEST_FILE),
      JSON.stringify(manifest, null, 2),
      "utf8",
    );

    const filenameBase = sanitizeFileSegment(graph.book.titleWorking || graph.book.slug || "book");
    const zipPath = path.join(tempDir, `${filenameBase}-archive.zip`);
    await execFileAsync("zip", ["-qr", zipPath, "."], { cwd: bundleDir });
    const archiveBytes = await readFile(zipPath);

    return {
      filename: `${filenameBase}-archive.zip`,
      bytes: archiveBytes,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export function archiveContentDisposition(filename: string) {
  return contentDisposition(filename);
}
