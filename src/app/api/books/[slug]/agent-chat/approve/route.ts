import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { db } from "@/lib/db";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { pruneToSingleCommittedArtifact } from "@/lib/repositories/artifact-lifecycle";
import { commitArtifactVersionInTransaction } from "@/lib/repositories/artifact-transaction-service";
import { commitStageAndUnlockNext } from "@/lib/workflows/stage-transition-service";
import {
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

interface ApproveBody {
  stageKey: StageKey;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  let body: ApproveBody;
  try {
    body = await parseLimitedJson(req, { label: "Stage approve request" });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    throw error;
  }
  const { stageKey } = body;
  if (!stageKey) return NextResponse.json({ error: "Missing stageKey" }, { status: 400 });

  try {
    const now = new Date();

    // Find the REVIEW_READY stage + artifact
    const bookStage = await db.bookStage.findUnique({
      where: { bookId_stageKey: { bookId: book.id, stageKey } },
      include: {
        artifacts: {
          where: { status: "REVIEW_READY" },
          include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!bookStage) return NextResponse.json({ error: "Stage not found" }, { status: 404 });

    const artifact = bookStage.artifacts[0];
    const version = artifact?.versions[0];
    let committedVersionId: string | null = null;

    if (artifact && version) {
      await db.$transaction(async (tx) => {
        await commitArtifactVersionInTransaction(tx, {
          artifactId: artifact.id,
          versionId: version.id,
          committedAt: now,
        });
        await pruneToSingleCommittedArtifact(tx, {
          bookId: book.id,
          stageId: bookStage.id,
          artifactType: artifact.artifactType,
          keepArtifactId: artifact.id,
          keepVersionId: version.id,
        });
      });
      committedVersionId = version.id;
    }

    const transition = await commitStageAndUnlockNext({
      bookId: book.id,
      workflowType: book.workflowType,
      stageKey,
      committedArtifactVersionId: committedVersionId,
      committedAt: now,
    });

    return NextResponse.json({ success: true, nextStageKey: transition.nextStageKey ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
