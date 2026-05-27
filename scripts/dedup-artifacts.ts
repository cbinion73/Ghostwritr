/**
 * Dedup artifact cleanup script
 *
 * Two kinds of cleanup:
 * 1. Duplicate ARTIFACTS — same title in same stage (keep newest, delete older)
 * 2. Excess VERSIONS — artifacts with more than 1 version (keep latest, delete older)
 *
 * Usage:
 *   npx tsx scripts/dedup-artifacts.ts              # dry run — shows what would be deleted
 *   npx tsx scripts/dedup-artifacts.ts --apply      # actually deletes
 *   npx tsx scripts/dedup-artifacts.ts --slug <slug> # limit to one book
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DRY_RUN = !process.argv.includes("--apply");
const slugFilter = (() => {
  const idx = process.argv.indexOf("--slug");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

async function main() {
  if (DRY_RUN) {
    console.log("🔍 DRY RUN — pass --apply to actually delete\n");
  } else {
    console.log("⚠️  APPLY MODE — deleting duplicates\n");
  }

  const books = await db.book.findMany({
    where: slugFilter ? { slug: slugFilter } : undefined,
    select: { id: true, slug: true, titleWorking: true },
    orderBy: { createdAt: "desc" },
  });

  let totalArtifactsDeleted = 0;
  let totalVersionsDeleted = 0;

  for (const book of books) {
    const stages = await db.bookStage.findMany({
      where: { bookId: book.id },
      include: {
        artifacts: {
          include: {
            versions: {
              select: { id: true, versionNumber: true, lifecycleState: true },
              orderBy: { versionNumber: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    let bookArtifactsDeleted = 0;
    let bookVersionsDeleted = 0;

    for (const stage of stages) {
      // ── 1. Duplicate artifacts (same title in same stage) ──────────────────
      // Group by normalized title
      const byTitle = new Map<string, typeof stage.artifacts>();
      for (const a of stage.artifacts) {
        const norm = (a.title ?? "").trim().toLowerCase().slice(0, 80);
        if (!byTitle.has(norm)) byTitle.set(norm, []);
        byTitle.get(norm)!.push(a);
      }

      for (const [title, group] of byTitle) {
        if (group.length <= 1) continue;
        // Keep the newest (last by createdAt, which is asc order → last in array)
        const toDelete = group.slice(0, group.length - 1);
        console.log(`\n  📖 ${book.titleWorking ?? book.slug} / ${stage.stageKey}`);
        console.log(`  Duplicate artifact "${title.slice(0, 60)}" — ${group.length} copies`);
        console.log(`  Keeping: ${group[group.length - 1].id.slice(0, 8)} (newest)`);
        for (const a of toDelete) {
          console.log(`  ${DRY_RUN ? "[would delete]" : "Deleting"} artifact ${a.id.slice(0, 8)} (${a.versions.length} versions)`);
          if (!DRY_RUN) {
            const versionIds = a.versions.map(v => v.id);
            // Null out FK references on BookStage before deleting versions
            if (versionIds.length > 0) {
              await db.bookStage.updateMany({
                where: { committedArtifactVersionId: { in: versionIds } },
                data: { committedArtifactVersionId: null },
              });
            }
            // Null out FK references on Artifact itself
            await db.artifact.update({
              where: { id: a.id },
              data: { currentVersionId: null, committedVersionId: null },
            });
            await db.artifactVersion.deleteMany({ where: { artifactId: a.id } });
            await db.artifact.delete({ where: { id: a.id } });
          }
          bookArtifactsDeleted++;
        }
      }

      // ── 2. Excess versions (artifact has > 1 version, keep latest) ─────────
      for (const a of stage.artifacts) {
        if (a.versions.length <= 1) continue;
        const toDelete = a.versions.slice(0, a.versions.length - 1); // keep last
        const keep = a.versions[a.versions.length - 1];
        console.log(`\n  📖 ${book.titleWorking ?? book.slug} / ${stage.stageKey}`);
        console.log(`  "${(a.title ?? "").slice(0, 60)}" has ${a.versions.length} versions`);
        console.log(`  Keeping v${keep.versionNumber} (${keep.lifecycleState})`);
        for (const v of toDelete) {
          console.log(`  ${DRY_RUN ? "[would delete]" : "Deleting"} v${v.versionNumber} (${v.lifecycleState})`);
          if (!DRY_RUN) {
            // Null out FK references before deleting this version
            await db.bookStage.updateMany({
              where: { committedArtifactVersionId: v.id },
              data: { committedArtifactVersionId: null },
            });
            await db.artifact.updateMany({
              where: { OR: [{ currentVersionId: v.id }, { committedVersionId: v.id }] },
              data: { currentVersionId: keep.id, committedVersionId: keep.id },
            });
            // Use deleteMany (safe if already gone via duplicate artifact cleanup)
            await db.artifactVersion.deleteMany({ where: { id: v.id } });
          }
          bookVersionsDeleted++;
        }
      }
    }

    if (bookArtifactsDeleted > 0 || bookVersionsDeleted > 0) {
      totalArtifactsDeleted += bookArtifactsDeleted;
      totalVersionsDeleted += bookVersionsDeleted;
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  if (DRY_RUN) {
    console.log(`Would delete: ${totalArtifactsDeleted} duplicate artifacts, ${totalVersionsDeleted} excess versions`);
    console.log(`Run with --apply to execute.`);
  } else {
    console.log(`Deleted: ${totalArtifactsDeleted} duplicate artifacts, ${totalVersionsDeleted} excess versions`);
  }

  await db.$disconnect();
}

main().catch(console.error);
