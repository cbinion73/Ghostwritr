/**
 * Dedup artifact maintenance script
 *
 * This command is intentionally non-destructive:
 * 1. Duplicate artifacts are superseded, not deleted.
 * 2. Artifact versions are never deleted.
 * 3. Artifacts with versions referenced by BookStage active/committed pointers
 *    are reported and skipped.
 *
 * Usage:
 *   npx tsx scripts/dedup-artifacts.ts                           # dry run
 *   npx tsx scripts/dedup-artifacts.ts --slug <slug>              # dry run one book
 *   npx tsx scripts/dedup-artifacts.ts --apply --confirm-supersede # mark safe duplicates SUPERSEDED
 */

import { ArtifactStatus, PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply") && process.argv.includes("--confirm-supersede");
const slugFilter = (() => {
  const idx = process.argv.indexOf("--slug");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

type ArtifactWithVersions = Awaited<ReturnType<typeof loadStagesForBook>>[number]["artifacts"][number];

function normalizeTitle(title: string | null): string {
  return (title ?? "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

function chooseKeeper(group: ArtifactWithVersions[], referencedVersionIds: Set<string>) {
  const committedReferenced = group.find((artifact) =>
    artifact.versions.some((version) => referencedVersionIds.has(version.id)),
  );
  if (committedReferenced) return committedReferenced;

  const committed = [...group]
    .reverse()
    .find((artifact) => artifact.status === ArtifactStatus.COMMITTED);
  if (committed) return committed;

  return group[group.length - 1];
}

async function loadStagesForBook(bookId: string) {
  return db.bookStage.findMany({
    where: { bookId },
    include: {
      artifacts: {
        where: { status: { not: ArtifactStatus.SUPERSEDED } },
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
}

async function main() {
  if (APPLY) {
    console.log("⚠️  APPLY MODE — safe duplicate artifacts will be marked SUPERSEDED\n");
  } else {
    console.log("🔍 DRY RUN — pass --apply --confirm-supersede to mark safe duplicates SUPERSEDED\n");
  }

  const books = await db.book.findMany({
    where: slugFilter ? { slug: slugFilter } : undefined,
    select: { id: true, slug: true, titleWorking: true },
    orderBy: { createdAt: "desc" },
  });

  let totalArtifactsSuperseded = 0;
  let totalArtifactsSkipped = 0;
  let totalVersionHistoryRows = 0;

  for (const book of books) {
    const stages = await loadStagesForBook(book.id);

    let bookArtifactsSuperseded = 0;
    let bookArtifactsSkipped = 0;
    let bookVersionHistoryRows = 0;

    for (const stage of stages) {
      const referencedVersionIds = new Set<string>(
        [
          stage.activeArtifactVersionId,
          stage.committedArtifactVersionId,
        ].filter((id): id is string => Boolean(id)),
      );

      const byTitle = new Map<string, typeof stage.artifacts>();
      for (const a of stage.artifacts) {
        const norm = normalizeTitle(a.title);
        if (!byTitle.has(norm)) byTitle.set(norm, []);
        byTitle.get(norm)!.push(a);
      }

      for (const [title, group] of byTitle) {
        if (group.length <= 1) continue;
        const keeper = chooseKeeper(group, referencedVersionIds);
        const candidates = group.filter((artifact) => artifact.id !== keeper.id);
        console.log(`\n  📖 ${book.titleWorking ?? book.slug} / ${stage.stageKey}`);
        console.log(`  Duplicate artifact "${title.slice(0, 60)}" — ${group.length} active copies`);
        console.log(`  Keeping: ${keeper.id.slice(0, 8)} (${keeper.status})`);

        for (const artifact of candidates) {
          const hasReferencedVersion = artifact.versions.some((version) => referencedVersionIds.has(version.id));
          if (hasReferencedVersion) {
            console.log(`  [skip] artifact ${artifact.id.slice(0, 8)} has a stage-referenced version`);
            bookArtifactsSkipped++;
            continue;
          }

          console.log(`  ${APPLY ? "Superseding" : "[would supersede]"} artifact ${artifact.id.slice(0, 8)} (${artifact.versions.length} preserved versions)`);
          if (APPLY) {
            await db.artifact.update({
              where: { id: artifact.id },
              data: { status: ArtifactStatus.SUPERSEDED },
            });
          }
          bookArtifactsSuperseded++;
        }
      }

      for (const a of stage.artifacts) {
        if (a.versions.length <= 1) continue;
        const historyCount = a.versions.length - 1;
        console.log(`\n  📖 ${book.titleWorking ?? book.slug} / ${stage.stageKey}`);
        console.log(`  "${(a.title ?? "").slice(0, 60)}" has ${a.versions.length} versions`);
        console.log(`  Preserving ${historyCount} historical version${historyCount === 1 ? "" : "s"}; no version rows are deleted by this command.`);
        bookVersionHistoryRows += historyCount;
      }
    }

    if (bookArtifactsSuperseded > 0 || bookArtifactsSkipped > 0 || bookVersionHistoryRows > 0) {
      totalArtifactsSuperseded += bookArtifactsSuperseded;
      totalArtifactsSkipped += bookArtifactsSkipped;
      totalVersionHistoryRows += bookVersionHistoryRows;
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  if (APPLY) {
    console.log(`Superseded: ${totalArtifactsSuperseded} duplicate artifacts`);
  } else {
    console.log(`Would supersede: ${totalArtifactsSuperseded} duplicate artifacts`);
    console.log(`Run with --apply --confirm-supersede to execute.`);
  }
  console.log(`Skipped referenced artifacts: ${totalArtifactsSkipped}`);
  console.log(`Historical versions preserved: ${totalVersionHistoryRows}`);

  await db.$disconnect();
}

main().catch(console.error);
