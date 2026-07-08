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
import { db } from "@/lib/db";
import { STAGE_TOKENS, FICTION_STAGE_TOKENS } from "@/lib/ui/stage-tokens";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const book = await db.book.findUnique({
    where: { slug },
    select: {
      workflowType: true,
      stages: { select: { stageKey: true, status: true } },
    },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tokens = book.workflowType === BookWorkflowType.FICTION ? FICTION_STAGE_TOKENS : STAGE_TOKENS;
  const stageByKey = new Map(book.stages.map((s) => [s.stageKey, s.status]));

  return NextResponse.json({
    stages: tokens.map((t) => ({ key: t.key, status: stageByKey.get(t.key) ?? "NOT_STARTED" })),
  });
}
