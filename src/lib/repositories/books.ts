import { BookStatus, BookWorkflowType, Prisma, StageKey, StageStatus } from "@prisma/client";

import { db, withDbRetry } from "../db";
import { getWorkflowStageKeys } from "../workflow-registry";
import { ensureDefaultLocalUser } from "../users";

export type CreateBookInput = {
  slug: string;
  titleWorking?: string;
  subtitle?: string;
  workflowType?: BookWorkflowType;
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
          workflowType: input.workflowType ?? BookWorkflowType.NONFICTION,
          ownerUserId: owner.id,
          metadataJson: input.metadataJson ?? {},
          status: BookStatus.DRAFT,
        },
      });

      const stageKeys = getWorkflowStageKeys(input.workflowType ?? BookWorkflowType.NONFICTION);

      await tx.bookStage.createMany({
        data: stageKeys.map((stageKey, index) => ({
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

export async function getBookBySlugOrThrow(slug: string) {
  const book = await getBookBySlug(slug);

  if (!book) {
    throw new Error(`Book not found for slug "${slug}"`);
  }

  return book;
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
  workflowType?: BookWorkflowType;
  ownerUserId?: string;
}) {
  const nextSlug = await generateUniqueSlugFromTitle(input.titleWorking);

  return createBookWithStages({
    slug: nextSlug,
    titleWorking: input.titleWorking,
    subtitle: input.subtitle,
    workflowType: input.workflowType ?? BookWorkflowType.NONFICTION,
    ownerUserId: input.ownerUserId,
  });
}

async function generateUniqueSlugFromTitle(titleWorking: string) {
  const baseSlug = slugifyBookTitle(titleWorking) || "untitled-book";
  let nextSlug = baseSlug;
  let suffix = 2;

  while (
    await withDbRetry(() =>
      db.book.findUnique({ where: { slug: nextSlug }, select: { id: true } }),
    )
  ) {
    nextSlug = `${baseSlug}-${suffix++}`;
  }

  return nextSlug;
}

function sanitizeClonedMetadata(metadataJson: unknown, sourceSlug: string) {
  const metadata =
    metadataJson && typeof metadataJson === "object"
      ? { ...(metadataJson as Record<string, unknown>) }
      : {};

  return {
    ...metadata,
    clonedFrom: sourceSlug,
    workflowAutomation: {
      enabled: false,
      mode: "manual",
      lastSummary: {
        status: "manual",
        title: "Branch created",
        detail: `Cloned from ${sourceSlug}. Automation is disabled on the new branch until you choose a mode.`,
        at: new Date().toISOString(),
      },
      history: [],
    },
  } satisfies Prisma.InputJsonValue;
}

function normalizeJsonInput(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return value === null
    ? (Prisma.JsonNull as unknown as Prisma.InputJsonValue)
    : (value as Prisma.InputJsonValue);
}

export async function cloneBookBySlug(
  sourceSlug: string,
  input?: {
    titleWorking?: string;
    subtitle?: string | null;
  },
) {
  const source = await withDbRetry(() =>
    db.book.findUnique({
      where: { slug: sourceSlug },
      include: {
        stages: {
          orderBy: { createdAt: "asc" },
        },
        artifacts: {
          include: {
            versions: {
              orderBy: { versionNumber: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
  );

  if (!source) {
    throw new Error(`Book not found for slug "${sourceSlug}"`);
  }

  const titleWorking = input?.titleWorking?.trim() || `${source.titleWorking ?? "Untitled Book"} Branch`;
  const subtitle =
    input?.subtitle !== undefined ? input.subtitle : source.subtitle;
  const slug = await generateUniqueSlugFromTitle(titleWorking);
  const owner =
    source.ownerUserId != null
      ? { id: source.ownerUserId }
      : await ensureDefaultLocalUser();

  return withDbRetry(() =>
    db.$transaction(async (tx) => {
      const clonedBook = await tx.book.create({
        data: {
          slug,
          titleWorking,
          subtitle: subtitle ?? null,
          workflowType: source.workflowType,
          ownerUserId: owner.id,
          metadataJson: sanitizeClonedMetadata(source.metadataJson, source.slug),
          status: source.status,
        },
      });

      const stageIdMap = new Map<string, string>();
      const versionIdMap = new Map<string, string>();

      for (const sourceStage of source.stages) {
        const stage = await tx.bookStage.create({
          data: {
            bookId: clonedBook.id,
            stageKey: sourceStage.stageKey,
            status: sourceStage.status,
            metadataJson: normalizeJsonInput(sourceStage.metadataJson),
            startedAt: sourceStage.startedAt,
            committedAt: sourceStage.committedAt,
          },
        });
        stageIdMap.set(sourceStage.id, stage.id);
      }

      for (const sourceArtifact of source.artifacts) {
        const clonedArtifact = await tx.artifact.create({
          data: {
            bookId: clonedBook.id,
            stageId: stageIdMap.get(sourceArtifact.stageId) ?? "",
            artifactType: sourceArtifact.artifactType,
            status: sourceArtifact.status,
            title: sourceArtifact.title,
            summary: sourceArtifact.summary,
            metadataJson: normalizeJsonInput(sourceArtifact.metadataJson),
          },
        });

        for (const sourceVersion of sourceArtifact.versions) {
          const clonedVersion = await tx.artifactVersion.create({
            data: {
              artifactId: clonedArtifact.id,
              versionNumber: sourceVersion.versionNumber,
              lifecycleState: sourceVersion.lifecycleState,
              contentJson: normalizeJsonInput(sourceVersion.contentJson),
              contentText: sourceVersion.contentText,
              summary: sourceVersion.summary,
              createdByType: sourceVersion.createdByType,
              createdByUserId: sourceVersion.createdByUserId,
              workflowRunId: null,
              basedOnVersionIdsJson: normalizeJsonInput(sourceVersion.basedOnVersionIdsJson),
              promptTemplateVersion: sourceVersion.promptTemplateVersion,
              modelName: sourceVersion.modelName,
              committedAt: sourceVersion.committedAt,
              createdAt: sourceVersion.createdAt,
            },
          });
          versionIdMap.set(sourceVersion.id, clonedVersion.id);
        }

        await tx.artifact.update({
          where: { id: clonedArtifact.id },
          data: {
            currentVersionId: sourceArtifact.currentVersionId
              ? versionIdMap.get(sourceArtifact.currentVersionId) ?? null
              : null,
            committedVersionId: sourceArtifact.committedVersionId
              ? versionIdMap.get(sourceArtifact.committedVersionId) ?? null
              : null,
          },
        });
      }

      for (const sourceStage of source.stages) {
        await tx.bookStage.update({
          where: {
            bookId_stageKey: {
              bookId: clonedBook.id,
              stageKey: sourceStage.stageKey,
            },
          },
          data: {
            activeArtifactVersionId: sourceStage.activeArtifactVersionId
              ? versionIdMap.get(sourceStage.activeArtifactVersionId) ?? null
              : null,
            committedArtifactVersionId: sourceStage.committedArtifactVersionId
              ? versionIdMap.get(sourceStage.committedArtifactVersionId) ?? null
              : null,
          },
        });
      }

      return tx.book.findUniqueOrThrow({
        where: { id: clonedBook.id },
        include: {
          stages: {
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }, { maxWait: 10_000, timeout: 60_000 }),
  );
}

export async function deleteBookBySlug(slug: string) {
  return withDbRetry(() =>
    db.book.delete({
      where: { slug },
    }),
  );
}

export async function updateBookTitleMetadata(
  bookId: string,
  data: {
    titleWorking: string;
    subtitle?: string | null;
  },
) {
  return withDbRetry(() =>
    db.book.update({
      where: { id: bookId },
      data: {
        titleWorking: data.titleWorking,
        subtitle: data.subtitle ?? null,
      },
    }),
  );
}

export async function updateBookMetadata(bookId: string, metadataJson: Prisma.InputJsonValue) {
  return withDbRetry(() =>
    db.book.update({
      where: { id: bookId },
      data: {
        metadataJson,
      },
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
