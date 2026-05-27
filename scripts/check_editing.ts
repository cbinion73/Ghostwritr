import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const books = await db.book.findMany({ select: { id: true, slug: true, titleWorking: true }, orderBy: { createdAt: "desc" } });

  for (const book of books) {
    const editingStage = await db.bookStage.findUnique({
      where: { bookId_stageKey: { bookId: book.id, stageKey: "EDITING" } },
      include: {
        artifacts: {
          include: { versions: { select: { versionNumber: true, lifecycleState: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!editingStage || editingStage.artifacts.length === 0) continue;

    console.log(`\n📖 ${book.titleWorking ?? book.slug}`);
    console.log(`   EDITING stage: ${editingStage.status}`);
    for (const a of editingStage.artifacts) {
      const meta = a.metadataJson as Record<string,string> | null;
      const key = meta?.chapterKey ?? "(no key)";
      console.log(`   [${a.artifactType.padEnd(22)}] ${a.status.padEnd(14)} key=${key.padEnd(8)} "${a.title?.slice(0,50)}"`);
    }
  }
  await db.$disconnect();
}
main().catch(console.error);
