const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  const book = await db.book.findUnique({
    where: { slug: "lean-labs-2" },
  });

  // Replicate EXACTLY what getPromiseWorkspace does
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

  console.log("Artifacts found:", artifacts.length);
  
  const artifactMap = new Map(artifacts.map((artifact) => [artifact.artifactType, artifact]));
  
  console.log("Artifact types in map:", Array.from(artifactMap.keys()));
  
  const personaPackArtifact = artifactMap.get("PERSONA_PACK");
  console.log("\nPERSONA_PACK artifact:", !!personaPackArtifact);
  
  if (personaPackArtifact) {
    console.log("  Versions:", personaPackArtifact.versions.length);
    console.log("  versions[0]:", !!personaPackArtifact.versions[0]);
    
    if (personaPackArtifact.versions[0]) {
      const v0 = personaPackArtifact.versions[0];
      console.log("    versionNumber:", v0.versionNumber);
      console.log("    contentJson type:", typeof v0.contentJson);
      console.log("    contentJson null:", v0.contentJson === null);
      
      if (v0.contentJson && typeof v0.contentJson === 'object' && 'personas' in v0.contentJson) {
        console.log("    personas count:", v0.contentJson.personas.length);
        console.log("    First persona:", v0.contentJson.personas[0]?.name);
      }
    }
  } else {
    console.log("❌ PERSONA_PACK not found in map!");
  }
}

main()
  .catch((e) => {
    console.error("Error:", e.message);
  })
  .finally(async () => {
    await db.$disconnect();
  });
