# Rollback Guide

This file documents how to recover GHOSTWRITR to a known-good checkpoint.

## Active checkpoint

**Tag:** `checkpoint/post-voice-framework`
**Date:** 2026-04-20
**What's in it:** Voice framework migration + canonical personas in code + soft-delete persistence fix.

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

The DB and the Prisma schema may have drifted if the broken change added columns. Push the checkpoint schema back:

```bash
npx prisma db push
npm run db:generate
```

> **Note:** GHOSTWRITR's DB evolves via `prisma db push`, not `migrate dev`. There is documented drift between `prisma/migrations/` history and the live DB. A `prisma migrate dev` would demand a destructive reset — don't run it unless you have a full `pg_dump` backup.

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
