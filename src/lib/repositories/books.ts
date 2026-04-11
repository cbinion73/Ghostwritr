import { BookStatus, Prisma, StageKey, StageStatus } from "@prisma/client";

import { db, withDbRetry } from "../db";
import { STAGE_ORDER } from "../stages";
import { ensureDefaultLocalUser } from "../users";

export type CreateBookInput = {
  slug: string;
  titleWorking?: string;
  subtitle?: string;
  ownerUserId?: string;
  metadataJson?: Prisma.InputJsonValue;
};

function slugifyBookTitle(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export async function createBookWithStages(input: CreateBookInput) {
  return withDbRetry(() =>
    db.$transaction(async (tx) => {
      const owner =
        input.ownerUserId != null
          ? { id: input.ownerUserId }
          : await ensureDefaultLocalUser();

      const book = await tx.book.create({
        data: {
          slug: input.slug,
          titleWorking: input.titleWorking,
          subtitle: input.subtitle,
          ownerUserId: owner.id,
          metadataJson: input.metadataJson ?? {},
          status: BookStatus.DRAFT,
        },
      });

      await tx.bookStage.createMany({
        data: STAGE_ORDER.map((stageKey, index) => ({
          bookId: book.id,
          stageKey: stageKey as StageKey,
          status: index === 0 ? StageStatus.IN_PROGRESS : StageStatus.NOT_STARTED,
        })),
      });

      return tx.book.findUniqueOrThrow({
        where: { id: book.id },
        include: {
          stages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }),
  );
}

export async function getOrCreateBookBySlug(slug: string) {
  const existing = await getBookBySlug(slug);

  if (existing) {
    return existing;
  }

  const titleWorking = slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return createBookWithStages({
    slug,
    titleWorking,
  });
}

export async function getBookBySlug(slug: string) {
  return withDbRetry(() =>
    db.book.findUnique({
      where: { slug },
      include: {
        stages: {
          orderBy: { createdAt: "asc" },
        },
        artifacts: true,
      },
    }),
  );
}

export async function listBooks() {
  return withDbRetry(() =>
    db.book.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        stages: {
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  );
}

export async function createBookFromTitle(input: {
  titleWorking: string;
  subtitle?: string;
  ownerUserId?: string;
}) {
  const baseSlug = slugifyBookTitle(input.titleWorking) || "untitled-book";
  let nextSlug = baseSlug;
  let suffix = 2;

  while (
    await withDbRetry(() =>
      db.book.findUnique({ where: { slug: nextSlug }, select: { id: true } }),
    )
  ) {
    nextSlug = `${baseSlug}-${suffix++}`;
  }

  return createBookWithStages({
    slug: nextSlug,
    titleWorking: input.titleWorking,
    subtitle: input.subtitle,
    ownerUserId: input.ownerUserId,
  });
}

export async function deleteBookBySlug(slug: string) {
  return withDbRetry(() =>
    db.book.delete({
      where: { slug },
    }),
  );
}

export async function getStageForBook(bookId: string, stageKey: StageKey) {
  return withDbRetry(() =>
    db.bookStage.findUnique({
      where: {
        bookId_stageKey: {
          bookId,
          stageKey,
        },
      },
    }),
  );
}

export async function updateStageForBook(
  bookId: string,
  stageKey: StageKey,
  data: {
    status?: StageStatus;
    activeArtifactVersionId?: string | null;
    committedArtifactVersionId?: string | null;
    committedAt?: Date | null;
    metadataJson?: Prisma.InputJsonValue;
    startedAt?: Date | null;
  },
) {
  return withDbRetry(() =>
    db.bookStage.update({
      where: {
        bookId_stageKey: {
          bookId,
          stageKey,
        },
      },
      data,
    }),
  );
}
