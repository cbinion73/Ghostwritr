# Framework-Flow Migration — Implementation Brief

**Author:** Amelia (dev agent), roundtable 2026-04-20
**Scope:** Make the chapter-shaping framework a first-class field on `WriterPersona` so the voice-blending actions can reason about structure, not just tone.
**Why now:** Round 6 evaluation revealed each voice ships a distinct chapter framework buried in prose. Surfacing it as data unlocks framework-aware blend suggestions and framework-aware preview generation.

---

## 1. Acceptance Criteria

- **AC-1** `WriterPersona` model gains `frameworkFlowJson Json @default("[]")` and `frameworkName String?` in `prisma/schema.prisma`.
- **AC-2** `npx prisma migrate dev --name add_framework_flow` runs cleanly against `postgresql://chris@localhost:5432/book_platform_builder`; migration file committed under `prisma/migrations/<timestamp>_add_framework_flow/`.
- **AC-3** `prisma/seed-framework-flows.ts` updates all 5 personas by slug; re-running is idempotent (uses `updateMany` by slug).
- **AC-4** Running the seed leaves every persona with `frameworkName != null` and `frameworkFlowJson` array length ≥ 5.
- **AC-5** `suggestWriterPersonas` (`actions.ts:256`) sends `frameworkName` + flow slots in `personaCatalog`; system prompt references "framework flow" explicitly.
- **AC-6** `generateVoiceBlendPreview` (`actions.ts:71`) looks up the dominant persona's framework, injects it as an ordered slot list, and the prompt instructs the model to "structure the preview using this framework."
- **AC-7** `src/lib/repositories/writer-personas.ts` returns both new fields from `getActiveWriterPersonas` and `getWriterPersonaById`.
- **AC-8** `npm run check` passes.
- **AC-9** Loading `/books/<slug>/setup` for a book with a pre-existing locked blend renders without runtime errors; framework resolved server-side from persona ids.
- **AC-10** `WriterPersonaBlend` type in `book-setup-types.ts` is unchanged (Phase 1 stability).

## 2. File Manifest

**Modify:**
- `@/prisma/schema.prisma` (WriterPersona model, line 222)
- `@/src/lib/repositories/writer-personas.ts`
- `@/src/app/books/[slug]/setup/actions.ts` (lines 71, 256)
- `@/package.json` (add `db:seed:flows` script)

**Create:**
- `@/prisma/seed-framework-flows.ts`
- `@/prisma/migrations/<timestamp>_add_framework_flow/migration.sql` (generated)

**Read only (reference):**
- `@/src/lib/book-setup-types.ts` — confirm `WriterPersonaBlend` untouched

## 3. Prisma Migration

**Schema diff** (`prisma/schema.prisma` ~line 222):

```prisma
model WriterPersona {
  // ...existing fields...
  signaturePatternsJson Json
  frameworkFlowJson     Json     @default("[]")
  frameworkName         String?
  // ...
}
```

**Generated SQL:**

```sql
ALTER TABLE "WriterPersona"
  ADD COLUMN "frameworkFlowJson" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "frameworkName" TEXT;
```

**Command:**
```
npm run db:migrate:dev -- --name add_framework_flow
```

Follow with `npm run db:generate` if client types don't auto-refresh.

## 4. Seed Script

**File:** `prisma/seed-framework-flows.ts`

```ts
import { PrismaClient, Prisma } from "@prisma/client";
const prisma = new PrismaClient();

const FLOWS: Array<{
  slug: string;
  frameworkName: string;
  frameworkFlowJson: Prisma.InputJsonValue;
}> = [
  {
    slug: "andygpt-aefb79bd",
    frameworkName: "ME-WE-TRUTH-YOU-WE",
    frameworkFlowJson: [
      { slot: "me", prompt: "Open with personal tension — 'you ever...' moment the reader recognizes" },
      { slot: "we", prompt: "Widen to a shared human pattern" },
      { slot: "truth", prompt: "Deliver the principle — the sticky, repeatable statement" },
      { slot: "you", prompt: "Translate to second-person application" },
      { slot: "we_close", prompt: "Return to shared resolution; one small actionable step" },
    ],
  },
  {
    slug: "cahngpt-958d4283",
    frameworkName: "Mystery → Pattern → Strategy",
    frameworkFlowJson: [
      { slot: "possibility", prompt: "Open with a 'what if?' cascade" },
      { slot: "connection", prompt: "Point to shared recognition ('you've seen this before')" },
      { slot: "reframe", prompt: "Declare 'this isn't random'" },
      { slot: "reveal", prompt: "Name the pattern explicitly" },
      { slot: "meaning", prompt: "Explain what the pattern means" },
      { slot: "action", prompt: "Tell the reader what to do with the pattern" },
    ],
  },
  {
    slug: "druckergpt-16626121",
    frameworkName: "Diagnose → Prioritize → Execute",
    frameworkFlowJson: [
      { slot: "result", prompt: "What result must be true in 30–60 days?" },
      { slot: "problem", prompt: "Separate the real problem from symptoms" },
      { slot: "priorities", prompt: "Narrow to the critical few" },
      { slot: "tradeoffs", prompt: "Make the cost of decisions explicit" },
      { slot: "action", prompt: "Identify the highest-leverage action" },
      { slot: "owner", prompt: "Assign accountability" },
      { slot: "deadline", prompt: "Define the time boundary" },
    ],
  },
  {
    slug: "elongpt-0cd4657b",
    frameworkName: "First-Principles Demolition",
    frameworkFlowJson: [
      { slot: "why", prompt: "Question the inherited practice — why done this way?" },
      { slot: "assumptions", prompt: "Call out which assumptions are wrong" },
      { slot: "constraints", prompt: "Distinguish real from assumed limits" },
      { slot: "rebuild", prompt: "Design the best version from zero" },
      { slot: "test", prompt: "Build and test quickly" },
    ],
  },
  {
    slug: "jobsgpt-64ca2c5a",
    frameworkName: "Old → New",
    frameworkFlowJson: [
      { slot: "problem", prompt: "State the problem simply" },
      { slot: "stakes", prompt: "Why it matters" },
      { slot: "old_way", prompt: "Name what's wrong with the current approach" },
      { slot: "new_way", prompt: "Introduce the better way" },
      { slot: "meaning", prompt: "Show what it means experientially" },
      { slot: "reinforce", prompt: "Repeat the core idea for emphasis" },
      { slot: "close", prompt: "Land on a clean, memorable final statement" },
    ],
  },
];

async function main() {
  for (const f of FLOWS) {
    const result = await prisma.writerPersona.updateMany({
      where: { slug: f.slug },
      data: { frameworkName: f.frameworkName, frameworkFlowJson: f.frameworkFlowJson },
    });
    console.log(`[seed] ${f.slug}: updated ${result.count} row(s)`);
  }
}
main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

**Invocation:** `npx tsx prisma/seed-framework-flows.ts`. Add to `package.json` scripts:
```json
"db:seed:flows": "tsx prisma/seed-framework-flows.ts"
```

## 5. Prompt Changes

### `actions.ts:256` — `suggestWriterPersonas`

**Before** (`personaCatalog` build):
```ts
const personaCatalog = personas.map(p => ({
  id: p.id, name: p.name, description: p.description,
  voiceTraits: p.voiceTraitsJson, signaturePatterns: p.signaturePatternsJson,
}));
```

**After:**
```ts
const personaCatalog = personas.map(p => ({
  id: p.id, name: p.name, description: p.description,
  voiceTraits: p.voiceTraitsJson, signaturePatterns: p.signaturePatternsJson,
  frameworkName: p.frameworkName,
  frameworkFlow: p.frameworkFlowJson,
}));
```

**System prompt addition:**
> "Each persona ships a `frameworkFlow` — an ordered list of `{slot, prompt}` chapter-shaping steps. Weight framework fit heavily when matching to the book's promise."

### `actions.ts:71` — `generateVoiceBlendPreview`

**Add before prompt construction:**
```ts
const dominant = [...blend.personas].sort(
  (a, b) => b.percent - a.percent || a.personaId.localeCompare(b.personaId)
)[0];
const dominantPersona = await getWriterPersonaById(dominant.personaId);
const flow = (dominantPersona?.frameworkFlowJson ?? []) as Array<{slot: string; prompt: string}>;
const flowBlock = flow.length
  ? `\nStructure the preview using ${dominantPersona?.frameworkName}:\n` +
    flow.map((s, i) => `${i + 1}. [${s.slot}] ${s.prompt}`).join("\n")
  : "";
```

Append `flowBlock` into the user prompt after the blend description.

## 6. Repository Changes

`src/lib/repositories/writer-personas.ts` — Prisma `findMany`/`findUnique` calls currently use default select (all scalars). New fields will auto-return. If an explicit `select` exists in any query, add:
```ts
frameworkFlowJson: true,
frameworkName: true,
```
Run `npm run db:generate` after the migration to refresh client types.

## 7. `WriterPersonaBlend` Type

**No change.** Blend payload already carries `personaId`; actions resolve framework server-side via `getWriterPersonaById`. Embedding the framework in the blend would duplicate state and require re-migration when flows evolve. Keep the blend immutable-by-id; let framework be a late-bind lookup.

## 8. Edge Cases

- **Empty flow (`[]`):** Preview prompt omits `flowBlock` entirely; model falls back to blend traits only. No crash.
- **Tie in percent** (two personas at 50/50): Sort by `percent desc, personaId asc` — deterministic, no UX surprise. Documented inline.
- **Locked blend, pre-migration book:** Blend row unchanged; action fetches current persona row and gets new fields. Zero migration of `Book` rows needed.
- **User-created persona without a flow:** `frameworkFlowJson` defaults to `[]`, `frameworkName` null — preview gracefully skips the flow block via null-guard.

## 9. Commit Plan

1. `feat(schema): add frameworkFlowJson and frameworkName to WriterPersona`
2. `chore(db): migration add_framework_flow`
3. `feat(seed): backfill framework flows for 5 personas`
4. `feat(setup): inject framework flow into suggest + preview prompts`
5. `chore(repo): expose framework fields in writer-personas repository`

Commit order matters: schema + migration must land before seed (seed would fail against the old schema).

## 10. Friday Acceptance Check

1. `SELECT slug, "frameworkName", jsonb_array_length("frameworkFlowJson") FROM "WriterPersona";` returns 5 rows (the active custom personas), all with non-null name and length ≥ 5.
2. Trigger `suggestWriterPersonas` on a fresh book — inspect logged prompt; `frameworkFlow` array present per persona.
3. Generate a voice blend preview with AndyGPT dominant — output visibly follows ME → WE → TRUTH → YOU → WE_CLOSE beats.

## 11. Risk Register

- **R-1** — Prisma `Json` default `"[]"` quoting: Use `@default("[]")` literal; verify generated SQL is `DEFAULT '[]'`. Mitigation: inspect migration SQL before `db:migrate:dev`.
- **R-2** — Seed run before migration: Seed fails with "column does not exist." Mitigation: commit 1+2 before commit 3; document ordering.
- **R-3** — Prompt bloat: 5 personas × up to 7 slots may spike token count when combined with existing catalog. Mitigation: truncate `description` to 200 chars in `personaCatalog` if observed.
- **R-4** — Tie-break nondeterminism in dominant persona: Two personas at 50/50. Mitigation: documented `personaId.localeCompare` tiebreaker; covered in AC-6.
- **R-5** — User-created persona with no flow: Preview gracefully skips flow block via explicit null-guard in `generateVoiceBlendPreview`.
