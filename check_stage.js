const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  // Get the book
  const book = await db.book.findUnique({
    where: { slug: "lean-labs-2" },
  });

  // Get the PROMISE stage
  const stage = await db.bookStage.findFirst({
    where: { 
      bookId: book.id,
      stageKey: "PROMISE"
    },
  });

  console.log("Promise Stage:", {
    id: stage?.id,
    stageKey: stage?.stageKey,
    status: stage?.status,
  });

  // Get artifacts with stage filtering (like getPromiseArtifacts does)
  const artifacts = await db.artifact.findMany({
    where: {
      bookId: book.id,
      stage: {
        stageKey: "PROMISE",
      },
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
      },
    },
  });

  console.log("\nArtifacts found via stage filter:", artifacts.length);
  artifacts.forEach((a) => {
    console.log(`- ${a.artifactType}: ${a.versions.length} versions`);
  });

  // Now check if PERSONA_PACK is in the results
  const personaArtifact = artifacts.find(a => a.artifactType === "PERSONA_PACK");
  if (personaArtifact) {
    console.log("\n✅ PERSONA_PACK found!");
    console.log("Latest version:", personaArtifact.versions[0]?.versionNumber);
    console.log("Has contentJson:", !!personaArtifact.versions[0]?.contentJson);
  } else {
    console.log("\n❌ PERSONA_PACK NOT found in stage filter!");
  }
}

main()
  .catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
