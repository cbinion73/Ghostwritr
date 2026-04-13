const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();

async function main() {
  const book = await db.book.findUnique({
    where: { slug: "lean-labs-2" },
  });

  const personaArtifact = await db.artifact.findFirst({
    where: {
      bookId: book.id,
      artifactType: "PERSONA_PACK",
      stage: { stageKey: "PROMISE" },
    },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 3,
      },
    },
  });

  console.log("Latest 3 PERSONA_PACK versions:\n");
  personaArtifact.versions.forEach((v, i) => {
    console.log(`Version ${v.versionNumber}:`);
    const content = v.contentJson;
    console.log(`  Type: ${typeof content}`);
    console.log(`  Is null: ${content === null}`);
    console.log(`  Is object: ${typeof content === 'object'}`);
    
    if (content && typeof content === 'object') {
      console.log(`  Has 'personas' property: ${'personas' in content}`);
      if ('personas' in content && Array.isArray(content.personas)) {
        console.log(`  Persona count: ${content.personas.length}`);
        content.personas.forEach((p) => {
          console.log(`    - ${p.name || 'unnamed'}`);
        });
      } else {
        console.log(`  Content keys: ${Object.keys(content).join(', ')}`);
      }
    }
    console.log();
  });
}

main()
  .catch((e) => {
    console.error("Error:", e.message);
  })
  .finally(async () => {
    await db.$disconnect();
  });
