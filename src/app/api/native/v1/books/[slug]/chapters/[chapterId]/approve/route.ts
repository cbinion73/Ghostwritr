import { NextResponse } from "next/server";

import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import {
  markDraftApproved,
  markFinalRevisionApproved,
} from "@/lib/repositories/chapter-approval-state";
import { commitArtifactVersionInTransaction } from "@/lib/repositories/artifact-transaction-service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ slug: string; chapterId: string }> },
) {
  const { slug, chapterId } = await params;
  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const state = await db.chapterApprovalState.findUnique({
    where: { bookId_chapterId: { bookId: book.id, chapterId } },
  });
  const versionId = state?.finalRevisionPendingVersionId ?? state?.draftPendingVersionId;
  if (!state || !versionId) {
    return NextResponse.json({ error: "No pending chapter version is available for approval" }, { status: 409 });
  }

  const version = await db.artifactVersion.findFirst({
    where: { id: versionId, artifact: { bookId: book.id } },
    select: { id: true, artifactId: true },
  });
  if (!version) return NextResponse.json({ error: "Pending version not found" }, { status: 404 });

  await commitArtifactVersionInTransaction(db, {
    artifactId: version.artifactId,
    versionId: version.id,
    committedAt: new Date(),
  });

  if (state.finalRevisionPendingVersionId === version.id) {
    await markFinalRevisionApproved({ bookId: book.id, chapterId, versionId: version.id });
  } else {
    await markDraftApproved({ bookId: book.id, chapterId, versionId: version.id });
  }

  return NextResponse.json({ ok: true, chapterId, versionId: version.id });
}
