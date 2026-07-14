import { StageKey } from "@prisma/client";

import { getOrCreateBookBySlug } from "../../repositories/books";
import { commitOutlineStageBundle } from "../../repositories/outline-artifacts";
import { clearStageStaleDependency, invalidateDependentStagesForBook } from "../../workflow-dependencies";

export async function commitOutlineWorkflow(bookSlug: string) {
  const book = await getOrCreateBookBySlug(bookSlug);
  await commitOutlineStageBundle(book.id, { finalizeStage: false });
  await clearStageStaleDependency(bookSlug, StageKey.OUTLINE);
  await invalidateDependentStagesForBook(bookSlug, StageKey.OUTLINE);
}
