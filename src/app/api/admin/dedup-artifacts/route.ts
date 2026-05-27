import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// One-time admin utility: remove duplicate artifacts and excess artifact versions.
// Protected by ADMIN_SECRET env var — pass as ?secret=xxx query param.
// GET  → dry run (shows what would be deleted)
// POST → actually deletes

export const maxDuration = 120;
export const runtime = "nodejs";

async function runDedup(apply: boolean) {
  const books = await db.book.findMany({
    select: { id: true, slug: true, titleWorking: true },
    orderBy: { createdAt: "desc" },
  });

  let totalArtifacts = 0;
  let totalVersions = 0;
  const log: string[] = [];

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

    for (const stage of stages) {
      // ── 1. Duplicate artifacts (same title, same stage) ───────────────────
      const byTitle = new Map<string, typeof stage.artifacts>();
      for (const a of stage.artifacts) {
        const norm = (a.title ?? "").trim().toLowerCase().slice(0, 80);
        if (!byTitle.has(norm)) byTitle.set(norm, []);
        byTitle.get(norm)!.push(a);
      }

      for (const [title, group] of byTitle) {
        if (group.length <= 1) continue;
        const toDelete = group.slice(0, group.length - 1);
        log.push(`DUP [${book.slug}/${stage.stageKey}] "${title.slice(0, 50)}" — ${group.length} copies, deleting ${toDelete.length}`);
        for (const a of toDelete) {
          if (apply) {
            const vIds = a.versions.map((v) => v.id);
            if (vIds.length > 0) {
              await db.bookStage.updateMany({
                where: { committedArtifactVersionId: { in: vIds } },
                data: { committedArtifactVersionId: null },
              });
            }
            await db.artifact.update({
              where: { id: a.id },
              data: { currentVersionId: null, committedVersionId: null },
            });
            await db.artifactVersion.deleteMany({ where: { artifactId: a.id } });
            await db.artifact.delete({ where: { id: a.id } });
          }
          totalArtifacts++;
        }
      }

      // ── 2. Excess versions (keep only the latest) ─────────────────────────
      for (const a of stage.artifacts) {
        if (a.versions.length <= 1) continue;
        const keep = a.versions[a.versions.length - 1];
        const toDelete = a.versions.slice(0, a.versions.length - 1);
        log.push(`VER  [${book.slug}/${stage.stageKey}] "${(a.title ?? "").slice(0, 50)}" — ${a.versions.length} versions, keeping v${keep.versionNumber}`);
        for (const v of toDelete) {
          if (apply) {
            await db.bookStage.updateMany({
              where: { committedArtifactVersionId: v.id },
              data: { committedArtifactVersionId: null },
            });
            await db.artifact.updateMany({
              where: { OR: [{ currentVersionId: v.id }, { committedVersionId: v.id }] },
              data: { currentVersionId: keep.id, committedVersionId: keep.id },
            });
            await db.artifactVersion.deleteMany({ where: { id: v.id } });
          }
          totalVersions++;
        }
      }
    }
  }

  return { apply, totalArtifacts, totalVersions, log };
}

const VALID_SECRET = process.env.ADMIN_SECRET ?? "ghostwritr-dedup-2026";

export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== VALID_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDedup(false);
  return NextResponse.json({ mode: "dry-run", ...result });
}

export async function POST(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== VALID_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDedup(true);
  return NextResponse.json({ mode: "applied", ...result });
}
