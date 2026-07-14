import {
  ChapterApprovalStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { db } from "../db";

type TxOrClient = PrismaClient | Prisma.TransactionClient;

type VersionPointerInput = {
  bookId: string;
  chapterId: string;
  versionId: string;
  client?: TxOrClient;
};

function clientOrDefault(client?: TxOrClient): TxOrClient {
  return client ?? db;
}

export async function markDraftPending(input: VersionPointerInput) {
  const client = clientOrDefault(input.client);
  return client.chapterApprovalState.upsert({
    where: {
      bookId_chapterId: {
        bookId: input.bookId,
        chapterId: input.chapterId,
      },
    },
    create: {
      bookId: input.bookId,
      chapterId: input.chapterId,
      status: ChapterApprovalStatus.DRAFT_PENDING,
      draftPendingVersionId: input.versionId,
      isStale: false,
      staleReason: null,
      staleAt: null,
    },
    update: {
      status: ChapterApprovalStatus.DRAFT_PENDING,
      draftPendingVersionId: input.versionId,
      isStale: false,
      staleReason: null,
      staleAt: null,
    },
  });
}

export async function markDraftApproved(input: VersionPointerInput) {
  const client = clientOrDefault(input.client);
  return client.chapterApprovalState.upsert({
    where: {
      bookId_chapterId: {
        bookId: input.bookId,
        chapterId: input.chapterId,
      },
    },
    create: {
      bookId: input.bookId,
      chapterId: input.chapterId,
      status: ChapterApprovalStatus.DRAFT_APPROVED,
      approvedDraftVersionId: input.versionId,
      isStale: false,
      staleReason: null,
      staleAt: null,
    },
    update: {
      status: ChapterApprovalStatus.DRAFT_APPROVED,
      approvedDraftVersionId: input.versionId,
      isStale: false,
      staleReason: null,
      staleAt: null,
    },
  });
}

export async function markFinalRevisionPending(input: VersionPointerInput) {
  const client = clientOrDefault(input.client);
  return client.chapterApprovalState.upsert({
    where: {
      bookId_chapterId: {
        bookId: input.bookId,
        chapterId: input.chapterId,
      },
    },
    create: {
      bookId: input.bookId,
      chapterId: input.chapterId,
      status: ChapterApprovalStatus.FINAL_REVISION_PENDING,
      finalRevisionPendingVersionId: input.versionId,
      isStale: false,
      staleReason: null,
      staleAt: null,
    },
    update: {
      status: ChapterApprovalStatus.FINAL_REVISION_PENDING,
      finalRevisionPendingVersionId: input.versionId,
      isStale: false,
      staleReason: null,
      staleAt: null,
    },
  });
}

export async function markFinalRevisionApproved(input: VersionPointerInput) {
  const client = clientOrDefault(input.client);
  return client.chapterApprovalState.upsert({
    where: {
      bookId_chapterId: {
        bookId: input.bookId,
        chapterId: input.chapterId,
      },
    },
    create: {
      bookId: input.bookId,
      chapterId: input.chapterId,
      status: ChapterApprovalStatus.FINAL_REVISION_APPROVED,
      approvedFinalVersionId: input.versionId,
      isStale: false,
      staleReason: null,
      staleAt: null,
    },
    update: {
      status: ChapterApprovalStatus.FINAL_REVISION_APPROVED,
      approvedFinalVersionId: input.versionId,
      isStale: false,
      staleReason: null,
      staleAt: null,
    },
  });
}

export async function markChapterApprovalStale(input: {
  bookId: string;
  chapterId: string;
  reason: string;
  markedAt?: Date;
  client?: TxOrClient;
}) {
  const client = clientOrDefault(input.client);
  const staleAt = input.markedAt ?? new Date();
  return client.chapterApprovalState.upsert({
    where: {
      bookId_chapterId: {
        bookId: input.bookId,
        chapterId: input.chapterId,
      },
    },
    create: {
      bookId: input.bookId,
      chapterId: input.chapterId,
      status: ChapterApprovalStatus.STALE,
      isStale: true,
      staleReason: input.reason,
      staleAt,
    },
    update: {
      status: ChapterApprovalStatus.STALE,
      isStale: true,
      staleReason: input.reason,
      staleAt,
    },
  });
}

export async function listChapterApprovalStates(bookId: string) {
  return db.chapterApprovalState.findMany({
    where: { bookId },
    orderBy: { chapterId: "asc" },
  });
}
