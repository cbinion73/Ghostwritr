import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const book = await db.book.findUnique({
    where: { slug },
    select: { id: true, titleWorking: true, subtitle: true, workflowType: true },
  });
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stageOrder = getWorkflowStageKeys(book.workflowType);

  // Fetch all stages with their artifact content
  const stages = await db.bookStage.findMany({
    where: { bookId: book.id },
    select: {
      stageKey: true,
      status: true,
      artifacts: {
        select: {
          title: true,
          metadataJson: true,
          status: true,
          versions: {
            select: { contentText: true },
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const stageMap = new Map(stages.map((s) => [s.stageKey, s]));

  const title = book.titleWorking ?? "Untitled Book";
  const subtitle = book.subtitle;

  const sections: string[] = [];

  for (const key of stageOrder) {
    const stage = stageMap.get(key);
    if (!stage || stage.artifacts.length === 0) continue;

    if (key === "CHAPTER_DRAFT") {
      // Include every chapter artifact individually
      const chapterSections = stage.artifacts
        .map((a) => {
          const text = a.versions[0]?.contentText;
          if (!text) return null;
          const meta = a.metadataJson as Record<string, string> | null;
          const chapterTitle = a.title ?? meta?.chapterTitle ?? "Chapter";
          return `## ${chapterTitle}\n\n${text}`;
        })
        .filter(Boolean) as string[];
      if (chapterSections.length > 0) {
        sections.push(`# Chapters\n\n${chapterSections.join("\n\n---\n\n")}`);
      }
    } else {
      // Use the most recent committed artifact, falling back to most recent overall
      const committed = stage.artifacts.filter((a) => a.status === "COMMITTED");
      const best = committed.length > 0
        ? committed[committed.length - 1]
        : stage.artifacts[stage.artifacts.length - 1];
      const contentText = best?.versions[0]?.contentText;
      if (!contentText) continue;
      const artifactTitle = best?.title ?? key.replace(/_/g, " ");
      const statusLabel = stage.status === "COMMITTED" ? "✓ Committed" : "Draft";
      sections.push(`## ${artifactTitle}\n\n_Stage: ${key.replace(/_/g, " ")} · ${statusLabel}_\n\n${contentText}`);
    }
  }

  if (sections.length === 0) {
    return NextResponse.json({ error: "No committed content to export" }, { status: 400 });
  }

  const header = subtitle
    ? `# ${title}\n### ${subtitle}\n`
    : `# ${title}\n`;

  const markdown = `${header}\n---\n\n${sections.join("\n\n---\n\n")}\n`;

  const filename = title
    .replace(/[^a-z0-9\s]/gi, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 60)
    + "-draft.md";

  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
