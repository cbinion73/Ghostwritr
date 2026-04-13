const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  // Get the book
  const book = await db.book.findUnique({
    where: { slug: "lean-labs-2" },
  });

  if (!book) {
    console.log("Book not found");
    process.exit(1);
  }

  console.log("Book found:", book.id, book.slug);

  // Get all artifacts for this book
  const artifacts = await db.artifact.findMany({
    where: { bookId: book.id },
    include: {
      versions: {
        select: {
          id: true,
          versionNumber: true,
          lifecycleState: true,
          contentJson: true,
        },
        orderBy: { versionNumber: "desc" }
      },
    },
  });

  console.log("\nTotal artifacts:", artifacts.length);
  console.log("\nArtifacts by type:");
  artifacts.forEach((artifact) => {
    console.log(`\n- ${artifact.artifactType}`);
    console.log(`  Title: ${artifact.title}`);
    console.log(`  Versions: ${artifact.versions.length}`);
    
    if (artifact.artifactType === "PERSONA_PACK" && artifact.versions.length > 0) {
      const latest = artifact.versions[0];
      console.log(`  Latest version (v${latest.versionNumber}): ${latest.lifecycleState}`);
      const content = latest.contentJson;
      if (content && typeof content === 'object' && 'personas' in content) {
        console.log(`  Personas in latest version: ${content.personas.length}`);
        content.personas.forEach((p) => {
          console.log(`    - ${p.name}`);
        });
      }
    }
  });
}

main()
  .catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
