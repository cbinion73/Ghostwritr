import { NextResponse } from "next/server";

import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { listBooksForUserWithParent } from "@/lib/repositories/books";
import { getWorkflowDefinition } from "@/lib/workflow-registry";

export const dynamic = "force-dynamic";

function stageLabel(stageKey: string, workflowType: Parameters<typeof getWorkflowDefinition>[0]) {
  return getWorkflowDefinition(workflowType).stages.find((stage) => stage.key === stageKey)?.label
    ?? stageKey.replace(/_/g, " ");
}

export async function GET() {
  const user = await requireAuthenticatedAppUser();
  const books = await listBooksForUserWithParent(user.id);

  return NextResponse.json({
    books: books.map((book) => {
      const committedCount = book.stages.filter((stage) => stage.status === "COMMITTED").length;
      const active = book.stages.find((stage) =>
        stage.status === "IN_PROGRESS" || stage.status === "READY_FOR_REVIEW" || stage.status === "BLOCKED",
      ) ?? [...book.stages].reverse().find((stage) => stage.status === "COMMITTED");

      return {
        id: book.id,
        slug: book.slug,
        title: book.titleWorking ?? "Untitled Book",
        subtitle: book.subtitle,
        workflowType: book.workflowType,
        coverImageUrl: book.coverImageUrl,
        isArchived: book.isArchived,
        progress: book.stages.length === 0 ? 0 : Math.round((committedCount / book.stages.length) * 100),
        activeStage: active ? stageLabel(active.stageKey, book.workflowType) : "Not started",
        updatedAt: book.updatedAt.toISOString(),
      };
    }),
  });
}
