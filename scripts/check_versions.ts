import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const slugArg = process.argv[2];
  
  // Find book - either by slug or just list all
  const books = slugArg 
    ? await db.book.findMany({ where: { slug: slugArg }, select: { id: true, slug: true, titleWorking: true } })
    : await db.book.findMany({ select: { id: true, slug: true, titleWorking: true }, orderBy: { createdAt: "desc" }, take: 10 });

  if (!books.length) { console.log("No books found"); return; }

  for (const book of books) {
    console.log(`\n📖 ${book.titleWorking ?? book.slug} (${book.slug})`);
    const stages = await db.bookStage.findMany({
      where: { bookId: book.id },
      include: {
        artifacts: {
          include: {
            versions: { select: { id: true, versionNumber: true, lifecycleState: true }, orderBy: { versionNumber: "asc" } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    for (const stage of stages) {
      if (stage.artifacts.length === 0) continue;
      const multiVer = stage.artifacts.filter(a => a.versions.length > 1);
      if (multiVer.length === 0) {
        console.log(`  ${stage.stageKey} — ${stage.artifacts.length} artifacts, all single-version`);
        continue;
      }
      console.log(`  ${stage.stageKey} (${stage.status}):`);
      for (const a of stage.artifacts) {
        const flag = a.versions.length > 1 ? "⚠ " : "  ";
        console.log(`    ${flag}[${a.versions.length}v] ${a.status.padEnd(14)} "${a.title?.slice(0,60)}"`);
      }
    }
  }
  await db.$disconnect();
}
main().catch(console.error);
