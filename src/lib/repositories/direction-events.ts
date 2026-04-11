import { ActorType, StageKey, type Prisma } from "@prisma/client";

import { db } from "../db";
import { ensureDefaultLocalUser } from "../users";
import { getStageForBook } from "./books";

export async function createDirectionEvent(input: {
  bookId: string;
  stageKey: StageKey;
  eventType: string;
  title: string;
  content?: string | null;
  metadataJson?: Prisma.InputJsonValue;
  artifactId?: string | null;
  actorType?: ActorType;
  actorUserId?: string | null;
}) {
  const stage = await getStageForBook(input.bookId, input.stageKey);

  if (!stage) {
    throw new Error(`Stage ${input.stageKey} not found for book ${input.bookId}`);
  }

  let actorUserId = input.actorUserId ?? null;
  const actorType = input.actorType ?? ActorType.USER;

  if (actorType === ActorType.USER && !actorUserId) {
    const defaultUser = await ensureDefaultLocalUser();
    actorUserId = defaultUser.id;
  }

  return db.directionEvent.create({
    data: {
      bookId: input.bookId,
      stageId: stage.id,
      artifactId: input.artifactId ?? null,
      eventType: input.eventType,
      actorType,
      actorUserId,
      title: input.title,
      content: input.content ?? null,
      metadataJson: input.metadataJson ?? {},
    },
  });
}

export async function listDirectionEventsForStage(input: {
  bookId: string;
  stageKey: StageKey;
  limit?: number;
}) {
  const stage = await getStageForBook(input.bookId, input.stageKey);

  if (!stage) {
    return [];
  }

  return db.directionEvent.findMany({
    where: {
      bookId: input.bookId,
      stageId: stage.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: input.limit ?? 12,
  });
}
