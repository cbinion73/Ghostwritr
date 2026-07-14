/**
 * Cheap poll target for the Studio's "something is running" watcher —
 * stageKey/status only, no artifact content. workspace-shell.tsx polls
 * this every few seconds while a stage is IN_PROGRESS and only calls the
 * expensive router.refresh() (which re-renders every unlocked stage's full
 * detail server component, per src/app/books/[slug]/page.tsx) when a
 * status actually changes, instead of on every tick.
 *
 * Must mirror page.tsx's `stages` construction exactly (same token list,
 * same NOT_STARTED default for stages with no BookStage row yet, e.g.
 * optional WORKBOOK_DESIGN) — otherwise the two lists never compare equal
 * and every poll looks like a "change", defeating the whole point.
 */

import { NextResponse } from "next/server";
import { BookWorkflowType } from "@prisma/client";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow, getStageForBook } from "@/lib/repositories/books";
import { STAGE_TOKENS, FICTION_STAGE_TOKENS } from "@/lib/ui/stage-tokens";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await requireAuthenticatedAppUser();

  let book;
  try {
    book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const stageKeys =
    book.workflowType === BookWorkflowType.FICTION
      ? FICTION_STAGE_TOKENS.map((token) => token.key)
      : STAGE_TOKENS.map((token) => token.key);
  const stages = await Promise.all(stageKeys.map((stageKey) => getStageForBook(book.id, stageKey)));

  const tokens = book.workflowType === BookWorkflowType.FICTION ? FICTION_STAGE_TOKENS : STAGE_TOKENS;
  const stageByKey = new Map(
    stages
      .filter((stage): stage is NonNullable<typeof stage> => Boolean(stage))
      .map((stage) => [stage.stageKey, stage.status]),
  );

  return NextResponse.json({
    stages: tokens.map((t) => ({ key: t.key, status: stageByKey.get(t.key) ?? "NOT_STARTED" })),
  });
}
