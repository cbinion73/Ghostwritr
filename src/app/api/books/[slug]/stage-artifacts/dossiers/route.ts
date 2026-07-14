/**
 * GET /api/books/[slug]/agent-chat/dossiers
 *
 * Returns the saved Personal Story dossier artifacts and the committed
 * OUTLINE artifact text so the client can build a chapter progress checklist.
 */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { getArtifactChapterId } from "@/lib/repositories/chapter-identity";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const user = await requireAuthenticatedAppUser();
  const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id).catch(() => null);
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  // Saved dossier artifacts for PERSONAL_STORIES (chronological)
  const dossierStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "PERSONAL_STORIES" } },
    select: {
      status: true,
      artifacts: {
        select: { id: true, chapterId: true, metadataJson: true, title: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Committed OUTLINE artifact text for chapter parsing
  const outlineStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey: "OUTLINE" } },
    select: {
      artifacts: {
        select: {
          versions: {
            select: { contentText: true },
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const outlineContent =
    outlineStage?.artifacts[0]?.versions[0]?.contentText ?? null;

  const dossiers = (dossierStage?.artifacts ?? []).map((a) => ({
    id: a.id,
    chapterId: getArtifactChapterId(a),
    title: a.title ?? "Untitled Dossier",
    createdAt: a.createdAt,
  }));

  return NextResponse.json({
    dossiers,
    stageStatus: dossierStage?.status ?? "NOT_STARTED",
    outlineContent,
  });
}
