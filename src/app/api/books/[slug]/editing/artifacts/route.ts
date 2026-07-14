import { NextResponse } from "next/server";
import { ActorType, ArtifactStatus, ArtifactType } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { ensureStageStarted } from "@/lib/workflows/stage-transition-service";
import { chapterIdentityMetadata, chapterIdentityWhere, getArtifactChapterId } from "@/lib/repositories/chapter-identity";
import { createArtifactVersionInTransaction } from "@/lib/repositories/artifact-transaction-service";
import { markFinalRevisionPending } from "@/lib/repositories/chapter-approval-state";
import {
  REQUEST_LIMITS,
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

// GET — returns all CHAPTER_DRAFT chapters merged with any existing MANUSCRIPT_REVISION edits
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  // Load source chapter drafts
  const draftStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "CHAPTER_DRAFT" } },
    select: {
      artifacts: {
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Load existing editing results — both new MANUSCRIPT_REVISION (new panel)
  // and legacy EDITORIAL_ASSESSMENT "Revised:" artifacts (old chat interface)
  const editingStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "EDITING" } },
    select: {
      status: true,
      artifacts: {
        where: {
          OR: [
            { artifactType: ArtifactType.MANUSCRIPT_REVISION },
            // Legacy: chat-committed revisions saved as EDITORIAL_ASSESSMENT with "Revised:" title
            { artifactType: ArtifactType.EDITORIAL_ASSESSMENT, title: { startsWith: "Revised:" } },
          ],
        },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
        orderBy: { createdAt: "desc" }, // latest first so newest win in the map
      },
    },
  });

  // Build a map of edits — keyed by chapterKey (new panel) or by normalized title (legacy)
  type EditRecord = { editArtifactId: string; editedContent: string; summaryNotes: string | null; status: string; isLegacy: boolean };
  const editByKey = new Map<string, EditRecord>();   // ch-1, ch-2 ...
  const editByTitle = new Map<string, EditRecord>(); // normalized chapter title → edit

  function normalizeTitle(t: string): string {
    return t.toLowerCase()
      .replace(/^revised:\s*/i, "")
      .replace(/^(chapter\s+\d+[:\s–—-]+)/i, "")
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .slice(0, 40);
  }

  for (const a of editingStage?.artifacts ?? []) {
    const meta = a.metadataJson as Record<string, string> | null;
    const record: EditRecord = {
      editArtifactId: a.id,
      editedContent: a.versions[0]?.contentText ?? "",
      summaryNotes: meta?.summaryNotes ?? null,
      status: a.status,
      isLegacy: a.artifactType === ArtifactType.EDITORIAL_ASSESSMENT,
    };
    // New panel artifacts have a chapterKey
    const key = meta?.chapterKey;
    if (key && !editByKey.has(key)) {
      editByKey.set(key, record);
    }
    // All artifacts get a title-based entry (new panel wins over legacy due to desc order)
    const norm = normalizeTitle(a.title ?? "");
    if (norm && !editByTitle.has(norm)) {
      editByTitle.set(norm, record);
    }
  }

  const chapters = (draftStage?.artifacts ?? []).map((a, idx) => {
    const meta = a.metadataJson as Record<string, string> | null;
    const chapterKey = meta?.chapterKey ?? `ch-${idx + 1}`;

    // Prefer exact chapterKey match; fall back to normalized title match
    const edit = editByKey.get(chapterKey) ?? editByTitle.get(normalizeTitle(a.title ?? ""));

    return {
      chapterKey,
      chapterTitle: a.title,
      sourceDraftId: a.id,
      sourceContent: a.versions[0]?.contentText ?? "",
      editArtifactId: edit?.editArtifactId ?? null,
      editedContent: edit?.editedContent ?? null,
      summaryNotes: edit?.summaryNotes ?? null,
      editStatus: edit?.status ?? null,
    };
  });

  return NextResponse.json({
    chapters,
    stageStatus: editingStage?.status ?? "NOT_STARTED",
  });
}

// POST — save a new Reed edit for a chapter
export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  let body: {
    chapterKey: string;
    chapterTitle: string;
    editedContent: string;
    summaryNotes?: string;
    sourceDraftId?: string;  // used to patch the source draft
  };
  try {
    body = await parseLimitedJson(req, {
      limitBytes: REQUEST_LIMITS.chatJsonBytes,
      label: "Editing save request",
    });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { chapterKey, chapterTitle, editedContent, summaryNotes, sourceDraftId } = body;

  if (!chapterKey || !chapterTitle || !editedContent) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Ensure EDITING stage exists
  const editingStage = await ensureStageStarted({ bookId: book.id, stageKey: "EDITING" });

  // Find or create one MANUSCRIPT_REVISION artifact per immutable chapter id.
  const existingRevision = await db.artifact.findFirst({
    where: {
      bookId: book.id,
      stageId: editingStage.id,
      artifactType: ArtifactType.MANUSCRIPT_REVISION,
      ...chapterIdentityWhere(chapterKey),
    },
    select: { id: true, versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
  });
  const artifact = existingRevision
    ? { id: existingRevision.id, versions: existingRevision.versions }
    : await db.artifact.create({
        data: {
          bookId: book.id,
          stageId: editingStage.id,
          artifactType: ArtifactType.MANUSCRIPT_REVISION,
          chapterId: chapterKey,
          title: chapterTitle,
          status: "REVIEW_READY",
          metadataJson: chapterIdentityMetadata(chapterKey, { chapterTitle, summaryNotes: summaryNotes ?? "" }),
        },
        select: { id: true, versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
      });
  const version = await createArtifactVersionInTransaction(db, {
    artifactId: artifact.id,
    lifecycleState: ArtifactStatus.REVIEW_READY,
    contentJson: { text: editedContent },
    contentText: editedContent,
    createdByType: ActorType.MODEL,
    artifactStatus: ArtifactStatus.REVIEW_READY,
    title: chapterTitle,
  });

  await db.artifact.update({
    where: { id: artifact.id },
    data: {
      currentVersionId: version.id,
      title: chapterTitle,
      status: "REVIEW_READY",
      metadataJson: chapterIdentityMetadata(chapterKey, { chapterTitle, summaryNotes: summaryNotes ?? "" }),
    },
  });
  await markFinalRevisionPending({
    bookId: book.id,
    chapterId: chapterKey,
    versionId: version.id,
  });

  // Also PATCH the source CHAPTER_DRAFT artifact so downstream (TYPESET) gets polished prose
  // Guard: only patch if content is valid prose (> 200 words) to prevent error messages overwriting chapters
  const wordCount = editedContent.trim().split(/\s+/).filter(Boolean).length;
  if (sourceDraftId && wordCount > 200) {
    const sourceDraft = await db.artifact.findFirst({
      where: { id: sourceDraftId, bookId: book.id },
      select: { id: true, versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (sourceDraft) {
      const patchedVersion = await createArtifactVersionInTransaction(db, {
        artifactId: sourceDraftId,
        lifecycleState: ArtifactStatus.REVIEW_READY,
        contentJson: { text: editedContent },
        contentText: editedContent,
        createdByType: ActorType.MODEL,
      });
      await db.artifact.update({
        where: { id: sourceDraftId },
        data: { currentVersionId: patchedVersion.id },
      });
    }
  }

  return NextResponse.json({ success: true, editArtifactId: artifact.id });
}

// PATCH — update an existing Reed edit
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  let body: {
    editArtifactId: string;
    editedContent: string;
    summaryNotes?: string;
    sourceDraftId?: string;
  };
  try {
    body = await parseLimitedJson(req, {
      limitBytes: REQUEST_LIMITS.chatJsonBytes,
      label: "Editing update request",
    });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { editArtifactId, editedContent, summaryNotes, sourceDraftId } = body;

  if (!editArtifactId || !editedContent) {
    return NextResponse.json({ error: "Missing editArtifactId or editedContent" }, { status: 400 });
  }

  const artifact = await db.artifact.findFirst({
    where: { id: editArtifactId, bookId: book.id },
    select: {
      id: true,
      chapterId: true,
      metadataJson: true,
      versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });
  if (!artifact) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });

  const newVersion = await createArtifactVersionInTransaction(db, {
    artifactId: editArtifactId,
    lifecycleState: ArtifactStatus.REVIEW_READY,
    contentJson: { text: editedContent },
    contentText: editedContent,
    createdByType: ActorType.USER,
    artifactStatus: ArtifactStatus.REVIEW_READY,
  });

  // Update summaryNotes in metadataJson if provided
  const existingMeta = (artifact.metadataJson as Record<string, string> | null) ?? {};
  await db.artifact.update({
    where: { id: editArtifactId },
    data: {
      currentVersionId: newVersion.id,
      ...(summaryNotes !== undefined
        ? { metadataJson: { ...existingMeta, summaryNotes } }
        : {}),
    },
  });
  const chapterId = getArtifactChapterId(artifact);
  if (chapterId) {
    await markFinalRevisionPending({
      bookId: book.id,
      chapterId,
      versionId: newVersion.id,
    });
  }

  // Patch source draft too — only if content is valid prose (> 200 words)
  const patchWordCount = editedContent.trim().split(/\s+/).filter(Boolean).length;
  if (sourceDraftId && patchWordCount > 200) {
    const sourceDraft = await db.artifact.findFirst({
      where: { id: sourceDraftId, bookId: book.id },
      select: { id: true, versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
    });
    if (sourceDraft) {
      const pv = await createArtifactVersionInTransaction(db, {
        artifactId: sourceDraftId,
        lifecycleState: ArtifactStatus.REVIEW_READY,
        contentJson: { text: editedContent },
        contentText: editedContent,
        createdByType: ActorType.USER,
      });
      await db.artifact.update({ where: { id: sourceDraftId }, data: { currentVersionId: pv.id } });
    }
  }

  return NextResponse.json({ success: true });
}
