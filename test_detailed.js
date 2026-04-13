const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function getPromiseWorkspace_DEBUG(bookSlug) {
  console.log("=== STEP 1: Get book ===");
  const book = await db.book.findUnique({
    where: { slug: bookSlug },
  });
  console.log("Book:", book.slug);

  console.log("\n=== STEP 2: Get stage ===");
  const stage = await db.bookStage.findFirst({
    where: {
      bookId: book.id,
      stageKey: "PROMISE"
    }
  });
  console.log("Stage:", stage.id);

  console.log("\n=== STEP 3: Get artifacts ===");
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
    orderBy: { createdAt: "asc" },
  });

  console.log("Total artifacts:", artifacts.length);
  artifacts.forEach(a => console.log(`  - ${a.artifactType}: ${a.versions.length} versions`));

  console.log("\n=== STEP 4: Create artifact map ===");
  const artifactMap = new Map(artifacts.map((artifact) => [artifact.artifactType, artifact]));
  console.log("Artifact types in map:", Array.from(artifactMap.keys()).join(", "));

  console.log("\n=== STEP 5: Parse PersonaPack ===");
  const personaArtifact = artifactMap.get("PERSONA_PACK");
  console.log("PersonaPack artifact exists:", !!personaArtifact);
  
  if (personaArtifact) {
    console.log("  versions.length:", personaArtifact.versions.length);
    console.log("  versions[0] exists:", !!personaArtifact.versions[0]);
    
    if (personaArtifact.versions[0]) {
      const v0 = personaArtifact.versions[0];
      console.log("  versions[0].contentJson type:", typeof v0.contentJson);
      console.log("  versions[0].contentJson is null:", v0.contentJson === null);
      console.log("  versions[0].contentJson is object:", v0.contentJson && typeof v0.contentJson === 'object');
      
      // This is what parseArtifactJson does
      const parseArtifactJson = (value, fallback) => {
        if (value && typeof value === "object") {
          return value;
        }
        return fallback;
      };

      const fallbackPersona = { personas: [{name: "Fallback"}] };
      const parsed = parseArtifactJson(v0.contentJson, fallbackPersona);
      
      console.log("\n  parseArtifactJson result:");
      console.log("    Using fallback:", JSON.stringify(parsed) === JSON.stringify(fallbackPersona));
      console.log("    Personas:", parsed.personas.map(p => p.name).join(", "));
    }
  }
}

getPromiseWorkspace_DEBUG("lean-labs-2")
  .catch(e => console.error(e))
  .finally(() => db.$disconnect());
