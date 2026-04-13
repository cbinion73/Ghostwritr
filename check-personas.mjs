#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n👥 PERSONA DATA CHECK\n");

  // Check for personas in artifacts
  const personaArtifacts = await prisma.artifactVersion.findMany({
    where: {
      artifact: {
        artifactType: "PERSONA_PACK",
      },
    },
    include: {
      artifact: {
        include: {
          book: true,
        },
      },
    },
  });

  if (personaArtifacts.length === 0) {
    console.log("No PERSONA_PACK artifacts found\n");
  } else {
    console.log(`Found ${personaArtifacts.length} PERSONA_PACK artifact(s):\n`);
    personaArtifacts.forEach((pa) => {
      console.log(`  📖 Book: ${pa.artifact.book.titleWorking} (${pa.artifact.book.slug})`);
      if (pa.contentJson && typeof pa.contentJson === 'object') {
        const personas = pa.contentJson.personas || [];
        console.log(`  👥 Personas: ${personas.length}`);
        personas.forEach((p, i) => {
          console.log(`     ${i + 1}. ${p.name || 'Unnamed'}`);
        });
      }
      console.log("");
    });
  }

  // Check all tables for any persona-related data
  console.log("\n📊 All Artifact Types in Database:\n");
  const allArtifacts = await prisma.artifact.findMany({
    select: {
      artifactType: true,
      _count: {
        select: { versions: true },
      },
    },
    distinct: ["artifactType"],
  });

  if (allArtifacts.length === 0) {
    console.log("No artifacts found\n");
  } else {
    allArtifacts.forEach((a) => {
      console.log(`  - ${a.artifactType} (${a._count.versions} version(s))`);
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
