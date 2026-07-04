/**
 * Backfill structured ResearchItem/ResearchSource and ExternalStoryItem/
 * ExternalStorySource rows from existing legacy {text} dossier artifacts.
 *
 * Run: npx tsx scripts/backfill-structured-extraction.ts [--dry-run] [--limit N]
 *
 * Only processes the LATEST version of each RESEARCH_PACK / EXTERNAL_STORY_PACK
 * artifact that has dossier text and no structured rows yet (idempotent —
 * safe to re-run; already-extracted versions are skipped).
 */
import { config } from "dotenv";
config();

import { PrismaClient, ArtifactType } from "@prisma/client";

import {
  extractResearchStructure,
  extractExternalStoryStructure,
} from "../src/lib/workflows/structured-extraction";

const db = new PrismaClient();

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

async function main() {
  const artifacts = await db.artifact.findMany({
    where: {
      artifactType: { in: [ArtifactType.RESEARCH_PACK, ArtifactType.EXTERNAL_STORY_PACK] },
    },
    select: {
      id: true,
      bookId: true,
      artifactType: true,
      title: true,
      metadataJson: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: { id: true, contentText: true },
      },
    },
  });

  let processed = 0;
  let skipped = 0;

  for (const artifact of artifacts) {
    if (processed >= limit) break;
    const version = artifact.versions[0];
    if (!version?.contentText?.trim()) {
      skipped += 1;
      continue;
    }

    const isResearch = artifact.artifactType === ArtifactType.RESEARCH_PACK;
    const existing = isResearch
      ? await db.researchItem.count({ where: { researchArtifactVersionId: version.id } })
      : await db.externalStoryItem.count({ where: { storyArtifactVersionId: version.id } });
    if (existing > 0) {
      skipped += 1;
      continue;
    }

    const chapterKey =
      (artifact.metadataJson as Record<string, string> | null)?.chapterKey ?? "book";

    if (dryRun) {
      console.log(`[dry-run] would extract ${artifact.artifactType} "${artifact.title}" (${chapterKey})`);
      processed += 1;
      continue;
    }

    try {
      const result = isResearch
        ? await extractResearchStructure({
            bookId: artifact.bookId,
            chapterKey,
            versionId: version.id,
            dossierText: version.contentText,
          })
        : await extractExternalStoryStructure({
            bookId: artifact.bookId,
            chapterKey,
            versionId: version.id,
            dossierText: version.contentText,
          });
      console.log(`✓ ${artifact.artifactType} "${artifact.title}" (${chapterKey}):`, result);
    } catch (err) {
      console.error(`✗ ${artifact.artifactType} "${artifact.title}":`, err instanceof Error ? err.message : err);
    }
    processed += 1;
  }

  console.log(`\nDone. Processed ${processed}, skipped ${skipped} (already extracted or empty).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
