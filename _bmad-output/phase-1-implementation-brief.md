# Phase 1 Monday Implementation Brief — Book Spine + Hunger Indicators

**Author:** Amelia (dev agent), roundtable 2026-04-20
**Scope:** Phase 1 of `ship-plan.md` — validate Sally's anti-condensation thesis on the existing Prisma stack before touching storage or agent architecture.
**Rule:** Read-only. No schema changes. No agent folders. No Markdown migration.

---

## 1. Acceptance Criteria

### Spine view
- **AC-1** Route `/books/[slug]` renders a server component that loads book + all stages via one Prisma call.
- **AC-2** Spine renders all 11 `StageKey` values in enum order as vertical cells, even if a stage row does not exist in DB.
- **AC-3** Each cell displays: stage label, `StageStatus`, updated-at relative timestamp, click-through link to existing per-stage page (`/books/[slug]/<stage-slug>`).
- **AC-4** Cell color reflects `StageStatus`: charcoal (NOT_STARTED), amber (IN_PROGRESS), teal (READY_FOR_REVIEW), gold (COMMITTED), red-600 (BLOCKED).
- **AC-5** Unknown slug → `notFound()` (Next 404), not a blank page.

### Hunger indicators
- **AC-6** Paragraph-topic stage cell (maps to `OUTLINE` stage for Phase 1) shows an inline child list: one row per chapter with a hunger meter.
- **AC-7** Hunger meter = fraction `paragraphTopicsWritten / targetParagraphTopics`; target is hardcoded `TARGET_PARAGRAPH_TOPICS_PER_CHAPTER = 40` for Phase 1.
- **AC-8** Meter renders 0–100% width bar + numeric label `N / 40`.
- **AC-9** Meter < 50% pulses via `animate-breathe` (custom Tailwind keyframe).
- **AC-10** Chapters with zero paragraph topics show `empty` variant (dashed border, no pulse).

### Non-functional
- **AC-11** `npm run check` passes with zero errors.
- **AC-12** Page renders in < 500ms on dev server for a book with ≤ 20 chapters (no N+1).

---

## 2. File Manifest

### Create
- `@/app/books/[slug]/page.tsx` — server component, the spine entry.
- `@/app/books/[slug]/components/book-spine.tsx` — server component, maps stages to cells.
- `@/app/books/[slug]/components/stage-cell.tsx` — server component, one cell.
- `@/app/books/[slug]/components/hunger-meter.tsx` — `"use client"` for `animate-breathe`; tiny, presentational.
- `@/app/books/[slug]/components/chapter-hunger-list.tsx` — server component, nested under outline cell.
- `@/lib/repositories/book-spine.ts` — new repo module (see §4).
- `@/lib/ui/stage-tokens.ts` — status-to-Tailwind-class map + stage label map + stage route slug map.

### Modify
- `tailwind.config.ts` (or `tailwind.config.js`) — add `breathe` keyframe + `animate-breathe` utility. If project is Tailwind v4 CSS-first, add `@keyframes breathe` to `globals.css` instead.

### Read-only (reference)
- `prisma/schema.prisma` — confirm `Chapter`, `ParagraphTopic` (or equivalent) relations.
- `@/lib/repositories/books.ts` — reuse `getOrCreateBookBySlug`, `getStageForBook`.
- `@/lib/repositories/research-artifacts.ts` — pattern reference for read queries.

### Do NOT touch
- Existing per-stage pages. No edits to `outline/page.tsx` etc.

---

## 3. Component Tree

```
BookPage (server, @/app/books/[slug]/page.tsx)
└── BookSpine (server)
    └── StageCell (server) x11
        └── [if stageKey === OUTLINE]
            └── ChapterHungerList (server)
                └── HungerMeter (client)  ← only client boundary
```

Data loads entirely in `BookPage`. Props flow down. Zero `useEffect`, zero client fetches.

---

## 4. Data Access Layer

New module `@/lib/repositories/book-spine.ts`:

```ts
export type SpineData = {
  book: Book;
  stages: Record<StageKey, Stage | null>;
  chapterHunger: Array<{
    chapterId: string;
    title: string;
    ordinal: number;
    paragraphTopicCount: number;
  }>;
};

export async function getBookSpine(slug: string): Promise<SpineData | null>;
```

Implementation: single Prisma call with `include: { stages: true, chapters: { include: { _count: { select: { paragraphTopics: true } } }, orderBy: { ordinal: 'asc' } } }`. If the `ParagraphTopic` model/relation name differs, adapt — confirm via `schema.prisma` on Monday. No writes.

---

## 5. Styling / Tokens

`@/lib/ui/stage-tokens.ts`:

```ts
export const STAGE_STATUS_CLASSES: Record<StageStatus, string> = {
  NOT_STARTED:      'bg-neutral-800 text-neutral-400 border-neutral-700',
  IN_PROGRESS:      'bg-amber-500/20 text-amber-200 border-amber-500',
  READY_FOR_REVIEW: 'bg-teal-500/20 text-teal-200 border-teal-500',
  COMMITTED:        'bg-yellow-500/20 text-yellow-100 border-yellow-500', // "gold"
  BLOCKED:          'bg-red-600/20 text-red-200 border-red-600',
};
```

Tailwind config addition:

```ts
keyframes: { breathe: { '0%,100%': { opacity: '0.6' }, '50%': { opacity: '1' } } },
animation: { breathe: 'breathe 2.4s ease-in-out infinite' },
```

Hunger meter fill: `bg-amber-500` < 50%, `bg-teal-500` 50–99%, `bg-yellow-500` 100%.

---

## 6. Edge Cases (Day One Behavior)

- **No stages rows in DB** → render all 11 cells as `NOT_STARTED`; do not create rows.
- **No chapters** → `ChapterHungerList` renders "No chapters yet — run Outline stage" muted text.
- **Chapter with 0 paragraph topics** → dashed-border empty row, meter at 0%, no pulse.
- **Outline stage missing entirely** → skip `ChapterHungerList`; cell renders plain.
- **Long books (>20 chapters)** → natural page scroll is acceptable for Phase 1; no virtualization. Note for Phase 2.
- **Invalid slug** → `notFound()`.

---

## 7. Out of Scope (Phase 1)

- No Markdown artifact storage migration.
- No `.agents/` folders or prompt files.
- No new per-stage routes or route renames.
- No writes, no mutations, no server actions.
- No manifest-based stage renaming (still LEGACY `StageKey` enum).
- No auth changes.
- No tests (framework not configured — see §10).
- No agent orchestration wiring.

---

## 8. Commit Plan

1. `feat(spine): add book-spine repository read helper`
2. `feat(spine): add stage-tokens ui module and tailwind breathe keyframe`
3. `feat(spine): render read-only book spine at /books/[slug]`
4. `feat(spine): nest chapter hunger meters under outline cell`
5. `chore(spine): handle empty-book and missing-stage edge cases`

---

## 9. Friday Acceptance Check

John's test: "Does he see the book or a dashboard?" → observable:

1. Landing on `/books/[slug]` shows **chapters named**, not just stage boxes. The outline cell expands inline with titled chapter rows.
2. At least one hunger meter is visibly pulsing (under-50% state) without any click.
3. Clicking a stage cell takes Chris to the existing stage page — spine is a lens, not a replacement.

If any of the three fails → Phase 1 did not land. Fix before Phase 2.

---

## 10. Risk Register

- **R-1** No test framework configured. Cannot satisfy the 100% test pass principle. Mitigation: add Vitest in Phase 2; Phase 1 relies on `npm run check` + manual Friday walkthrough.
- **R-2** Dirty working tree — 9+ files modified on `main` per `git status`. Mitigation: commit or stash before starting; spine work begins on a clean tree.
- **R-3** `ParagraphTopic` model name unverified. Mitigation: confirm in `prisma/schema.prisma` first thing Monday; rename query field only.
- **R-4** `src/app/books/[slug]/page.tsx` may already exist (not verified). Mitigation: `ls` first; if present, read before overwriting.
- **R-5** Legacy `StageKey` labels will mismatch manifest labels users expect. Mitigation: `stage-tokens.ts` label map is the single swap point for Phase 3 rename.
- **R-6** Tailwind config extension may collide if project uses v4 CSS-first config. Mitigation: check `tailwind.config.*` existence; if v4, add `@keyframes breathe` to `globals.css` instead.
