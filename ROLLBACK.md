# Rollback Guide

This file documents how to recover GHOSTWRITR to a known-good checkpoint.

## Active checkpoint

**Tag:** `checkpoint/morning-handoff` (latest, 2026-04-21)
**Previous tag:** `checkpoint/post-voice-framework` (2026-04-20)

**What's in the latest tag:** Complete BMAD v1 planning suite + Book Spine view + typed `GateDecision<A>` + baseline Prisma migration.

## Schema state (post-E1.S1)

The DB has been baselined. Migration history is now clean:

```
prisma/migrations/
  └── 20260422013017_baseline/   ← single migration reflecting live schema
  └── migration_lock.toml
```

`npx prisma migrate status` reports "Database schema is up to date."
Future schema changes use `npx prisma migrate dev --name <change>` (normal flow).
`db push` should NOT be needed going forward.

## Protected book

**Slug:** `4-pillars` — Chris's in-flight working book. Any rollback must restore this book's data intact.

## 5-minute rollback procedure

If a future change breaks the voice-blending or persona-sync flow:

### 1. Revert the code

```bash
git checkout checkpoint/post-voice-framework
```

Or, to keep current history but reset files only:

```bash
git checkout checkpoint/post-voice-framework -- .
```

### 2. Resync the schema

Use the standard migration flow (post-baseline, this works cleanly):

```bash
npx prisma migrate dev
npm run db:generate
```

> **Note (post-E1.S1):** Schema drift is resolved. `prisma migrate dev` is safe again.
> If a rollback requires re-baselining, see the "Re-baseline procedure" section below.

### 3. Resync persona data

The 5 canonical personas live in `src/lib/personas/*.ts`. They sync into the DB automatically on the next call to `getActiveWriterPersonas()` (hit any book's setup page, or run the seed explicitly):

```bash
npm run db:seed:flows
```

User-set `isActive` soft-deletes are preserved across sync. If you wiped the DB entirely and want to restore the 4 built-in personas as well, call `ensureDefaultWriterPersonas()` via the book setup page.

### 4. Restore book data (if needed)

A JSON data snapshot exists at `db-snapshots/2026-04-20-post-voice-framework.json`. It contains:

- 9 `WriterPersona` rows (5 custom + 4 built-in)
- 1 `Book` row (slug `4-pillars`)
- 11 `BookStage` rows
- 0 `AuthorProfile` rows

> `db-snapshots/` is gitignored. The file lives only on Chris's machine. Back it up externally if you care about it.

There's no automated restore tool. If you need to reload book data, write a one-off Node script that reads the JSON and upserts the rows by id. The snapshot preserves foreign-key relationships (bookId on BookStage, etc.).

## What the checkpoint does NOT cover

- **`pg_dump` backup** — `pg_dump` is not installed on Chris's machine. The JSON snapshot in `db-snapshots/` covers personas + books + stages only, not the full DB (artifacts, research items, workflow runs, etc.).
- **Pre-session uncommitted work** — several files in the working tree (research page, outline page, workflow files) were modified before this session started and are NOT in the checkpoint. Check `git status` after a rollback; those modifications will reappear unless separately handled.
- **`.env` and `.claude/settings.local.json`** — intentionally excluded from the commit. Chris's local secrets and editor prefs are not versioned.

## Creating a new checkpoint

When the next stable point is reached:

```bash
# Commit current work
git add <specific-files>
git commit -m "..."

# Tag
git tag -a checkpoint/<name> -m "<description>"

# Export data snapshot
node -e '
# See prior snapshot script — lives in conversation history.
'
```

Update this file with the new tag + date.

---

## Re-baseline procedure (if drift returns)

If someone reintroduces schema drift via `db push` or ad-hoc DB changes:

```bash
# 1. Backup
node -e '
const {PrismaClient} = require("@prisma/client");
const fs = require("fs");
const p = new PrismaClient();
(async () => {
  const snap = {
    exportedAt: new Date().toISOString(),
    writerPersonas: await p.writerPersona.findMany({include: {samples: true}}),
    books: await p.book.findMany(),
    bookStages: await p.bookStage.findMany(),
    authorProfiles: await p.authorProfile.findMany(),
  };
  fs.writeFileSync(`db-snapshots/pre-rebaseline-${Date.now()}.json`, JSON.stringify(snap, null, 2));
  await p.$disconnect();
})();'

# 2. Delete old migrations, reset DB, regenerate
rm -rf prisma/migrations/*_*/
# Requires PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION env var if an AI agent is running it:
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=yes npx prisma migrate reset --force --skip-seed
npx prisma migrate dev --name baseline --skip-seed

# 3. Re-seed canonical personas
npx tsx -e 'import("./src/lib/repositories/writer-personas").then(m => m.ensureCanonicalWriterPersonas())'
```

This is the exact procedure used in the 2026-04-21 re-baseline (E1.S1).
