# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What is GHOSTWRITR?

GHOSTWRITR is Chris's personal AI book production studio — a full-stack Next.js app that guides an author from raw idea to finished, exportable manuscript through a structured pipeline of AI agents. Each agent is a specialist with a name, persona, system prompt, and model assignment. The author converses with agents one stage at a time; each stage produces a committed artifact that gates the next.

**Live at:** `http://localhost:3000` (run `./start-dev.sh`)  
**Network:** `http://0.0.0.0:3000` (accessible on local network)

---

## Commands

```bash
./start-dev.sh        # ALWAYS use this — not npm run dev (see API key note below)
npm run build         # next build --webpack
npm run check         # TypeScript check — run before every commit
npm run db:generate   # prisma generate (after schema changes)
npm run db:push       # push schema to DB without migration
npm run db:migrate:dev # create a named migration
npm run db:studio     # Prisma Studio GUI at localhost:5555
```

### QA scripts (Playwright / regression)
```bash
npm run qa:nonfiction           # full nonfiction pipeline regression
npm run qa:full-system          # complete system regression
npm run qa:e2e:battery          # E2E test battery
npm run qa:archive              # archive roundtrip
npm run qa:artifact-contracts   # artifact shape contracts
npm run qa:autopilot            # workflow automation regression
npm run qa:editing-trust        # Reed editing regression
npm run qa:manuscript-length    # word count regression
```

### Critical: API key isolation

Claude Code injects `ANTHROPIC_API_KEY=""` (empty string) into child processes. `dotenv` sees it as already set and doesn't override from `.env`. **Always start the server with `./start-dev.sh`**, which greps keys directly from `.env` and exports them before launching Next.js.

```bash
# ✅ Correct
./start-dev.sh

# ❌ Wrong — agents will return "I need an API key configured"
npm run dev
```

---

## Product Terminology

| Term | Meaning |
|---|---|
| **Book Studio** | The main workspace at `/books/[slug]` — stage-gated pipeline UI. Implemented in `workspace-shell.tsx`. Never call this the "workspace" in user-facing copy. |
| **Stage Navigator** | Left sidebar in Book Studio listing all pipeline stages and their status. |
| **Agent Chat Panel** | The main panel where the author converses with the active stage's agent. |
| **Library** | The homepage (`/`) — all books, progress bars, create-book form. |
| **Personas** | Writer Personas page (`/personas`) — manage AI voice blend profiles. |
| **Dashboard** | Production dashboard (`/books/[slug]/dashboard`) — parallel stage orchestration view. |

---

## Stack

Next.js 16 App Router · React 19 · TypeScript · Prisma 6 (PostgreSQL) · LangChain (Anthropic / OpenAI / Google) · Zod 4

**Required env vars:** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`  
**LLM cost log:** `data/llm-cost-log.jsonl` (append-only, non-blocking)

---

## Architecture Overview

GHOSTWRITR is a multi-stage AI book authoring system. A `Book` moves through a fixed pipeline of `BookStage` records (one per `StageKey`). Each stage is driven by a named AI agent that produces `Artifact` records. Committing a stage locks its artifact and unlocks the next.

### Pipeline — Nonfiction

```
BOOK_SETUP → PROMISE → AUDIENCE → MARKET_ANALYSIS →
OUTLINE → BASE_STORY → RESEARCH → EXTERNAL_STORIES →
PERSONAL_STORIES → MANIFEST → CHAPTER_DRAFT → EDITING → TYPESET
```

### Pipeline — Fiction

```
BOOK_SETUP → STORY_SETUP → STORY_CORE → WORLD_CAST →
PLOT_BLUEPRINT → SCENE_PLAN → FICTION_DRAFT → EDITING → TYPESET
```

### Stage → Agent → Model mapping

| Stage | Agent Name | Default Model | Role key(s) |
|---|---|---|---|
| BOOK_SETUP | Blueprint | claude-sonnet-4-6 | `setup:voice-blending` |
| PROMISE | — | claude-sonnet-4-6 | `promise:author`, `promise:structured` |
| AUDIENCE | — | claude-sonnet-4-6 | `audience:author` |
| MARKET_ANALYSIS | — | gemini-2.5-flash | `market-analysis:research` |
| OUTLINE | Atlas | claude-sonnet-4-6 | `outline:phase-1/2/3` |
| BASE_STORY | — | claude-sonnet-4-6 | `base-story:author` |
| RESEARCH | Scout | gpt-5.4 (web search) | `research:agent-1/2/3` |
| EXTERNAL_STORIES | Chronicle | claude-sonnet-4-6 | `external-stories:extract/enrich` |
| PERSONAL_STORIES | Scribe | claude-sonnet-4-6 | `personal-stories:interview` |
| MANIFEST | Cartographer | claude-sonnet-4-6 | `manifest:generate` |
| CHAPTER_DRAFT | Quill | claude-sonnet-4-6 | `chapter-draft:author/revise` |
| EDITING | Reed | Sonnet (assess) / **Opus** (polish) | `final-editor:assess/polish` |
| TYPESET | — | gpt-5.4 | `typeset:plan` |
| Post-production | — | gpt-4o-mini (cost-optimized) | `press:kit`, `social:campaign`, `audio:prep`, `course:design`, `speaking:kit` |

Full routing in `src/lib/llm/routing.ts`. Override any role via env var:
```
LLM_CHAPTER_DRAFT_AUTHOR=anthropic:claude-opus-4-6
LLM_RESEARCH_AGENT_1_RESEARCHER=anthropic:claude-sonnet-4-6
```

**Only `final-editor:polish` uses Opus by default.** Everything else uses Sonnet, Haiku, or GPT variants for cost efficiency (~$38/book vs ~$85 all-Opus).

---

## UI Architecture

### Theme system

All pages use the dark theme. Two mechanisms:

**1. `.dark-shell` CSS class** (`src/app/globals.css` line ~1359)  
Overrides all CSS variables: `--bg: #1a1410`, `--panel: rgba(254,251,245,0.04)`, `--ink: #e8d5b0`, `--muted: #6a5a4a`, `--accent: #B8793A`, `--gold: #c9a96e`. Apply to the outermost div of any full page. Never use light-mode colors (`#efe6d6`, `#fefbf5`, `white`) inside `.dark-shell`.

**2. `AppTopBar` component** (`src/app/components/app-top-bar.tsx`)  
Shared navigation bar for all non-Book-Studio pages. Props:
```typescript
interface AppTopBarProps {
  bookSlug?: string;      // enables "↗ Book Title" breadcrumb link
  bookTitle?: string;     // shown in breadcrumb
  activePage?: "library" | "personas" | "dashboard" | "studio";
}
```
Shows: `GHOSTWRITR · Library · Personas · [↗ Book Title] · [Dashboard breadcrumb]`

### Page layout pattern

Every standalone pipeline stage page follows this structure:
```tsx
<div className="dark-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
  <AppTopBar bookSlug={slug} bookTitle={workspace.book.titleWorking ?? undefined} activePage="studio" />
  <div className="page-shell" style={{ flex: 1 }}>
    <aside className="glass-panel sidebar">
      <div className="brand-mark"><h1>GHOSTWRITR</h1></div>
      {/* book info */}
      <div className="stage-list">
        {STAGE_LINKS.map(stage => (
          <Link key={stage.key} href={stage.href(slug)}
            className={`stage-chip${stage.key === "THIS_STAGE" ? " active" : ""}`}>
            {stage.label}
          </Link>
        ))}
      </div>
    </aside>
    <main className="main-column">
      <section className="glass-panel topbar">
        {/* title + action buttons */}
      </section>
      <section className="glass-panel section-panel">
        {/* content */}
      </section>
    </main>
    <aside className="glass-panel rightbar">
      {/* optional right panel */}
    </aside>
  </div>
</div>
```

### Book Studio (`/books/[slug]`)

Book Studio is a **client-side SPA shell** (`workspace-shell.tsx`) — it does NOT use `.dark-shell` or `AppTopBar`. Instead it has its own topbar, stage navigator sidebar (`stage-nav.tsx`), and swaps panels client-side based on the selected stage key. The dark background comes from inline styles and the Book Studio's own CSS.

**UTILITY_LINKS** in `workspace-shell.tsx` — quick links rendered in the top bar:
```
Personas · Author · Dashboard · Files · Costs · Publish
```

### CSS classes reference

| Class | Purpose |
|---|---|
| `.page-shell` | 3-column grid (240px sidebar · flex main · 360px rightbar) |
| `.glass-panel` | Translucent panel with border + blur |
| `.glass-panel.sidebar` | Left sidebar panel |
| `.glass-panel.topbar` | Stage topbar strip |
| `.glass-panel.section-panel` | Content section card |
| `.stage-chip` | Nav pill (muted) |
| `.stage-chip.active` | Nav pill (amber accent, bold) |
| `.btn` | Standard button/link pill |
| `.btn-primary` | Filled amber button |
| `.brand-mark` | GHOSTWRITR header block in sidebar |
| `.muted` | Secondary text color |
| `.label` | Section label (uppercase, tracking) |
| `.dark-shell` | Full dark-theme override on outermost container |

**Dark palette constants for inline styles:**
```
Background:   #1a1410
Panel:        rgba(255,255,255,0.04)  (subtle)  / rgba(255,255,255,0.07) (raised)
Border:       rgba(255,255,255,0.08)
Active card:  rgba(184,121,58,0.12)  border rgba(184,121,58,0.3)
Success:      rgba(74,124,89,0.15)   border rgba(74,124,89,0.3)
Warning:      rgba(184,121,58,0.12)  border rgba(184,121,58,0.3)
Error:        rgba(180,60,60,0.12)   border rgba(180,60,60,0.3)
Text primary: #e8d5b0
Text muted:   #6a5a4a
Text label:   #c9a96e
Accent gold:  #c9a96e  /  amber: #B8793A
```

---

## Central API: `src/app/api/books/[slug]/agent-chat/route.ts`

All agent turns flow through this single SSE endpoint (`maxDuration: 300`).

**Request body:**
```typescript
{
  stageKey: StageKey;
  messages: { role: "user" | "assistant"; content: string }[];
  chapterContext?: string;   // chapter key for CHAPTER_DRAFT manifest path
  skipContext?: boolean;     // true = skip all DB queries (~2K tokens, for validator calls)
  polishMode?: boolean;      // true = escalate Reed to Opus
}
```

**Response:** SSE stream — `data: {"text":"..."}` chunks, terminated by `data: [DONE]`

### Context assembly (in order)

1. **Book brief** from `book.metadataJson` — premise, targetReader, promise, voiceTone, writerPersonaBlend (weighted %), chapterFormat, readerLevel, targetWordCount
2. `skipContext: true` → skip all DB queries (used for cheap validator calls)
3. **Prior committed stages** loaded in workflow order (`take: 1` each). `MULTI_ARTIFACT_STAGES = { PERSONAL_STORIES, CHAPTER_DRAFT, EDITING }` get ALL their own artifacts
4. **EDITING override**: replaces generic prior context with full assembled manuscript (all CHAPTER_DRAFT artifacts, deduplicated by title, stubs < 100 words skipped) + OUTLINE. Skips RESEARCH / EXTERNAL_STORIES / PERSONAL_STORIES (already integrated into chapters)
5. **CHAPTER_DRAFT manifest path**: when `chapterContext` is set, loads MANIFEST artifact, extracts the per-chapter section listing which RESEARCH / EXTERNAL_STORIES / PERSONAL_STORIES artifacts to inject. Falls back to outline-only if no manifest
6. **Source documents** (`USER_UPLOAD`) injected as brainstorm material. Truncated to 8,000 chars each. Skipped for EDITING

**EDITING model escalation**: Reed uses `final-editor:assess` (Sonnet) by default. Escalates to `final-editor:polish` (Opus) when `polishMode: true` or message matches `/\b(revise|rewrite|rework|polish this chapter|MANUSCRIPT_REVISION)\b/i`.

---

## Chapter Drafting: `chapter-draft-bmad-panel.tsx`

Auto-loop panel that iterates through parsed chapters sequentially.

**Flow per chapter:**
1. **Manifest gate**: checks for committed MANIFEST artifact. If missing, auto-builds it via SSE stream first
2. **`writeChapter()`**: streams Phase 1 plan + Phase 2 prose from Quill. Returns `{ content, completenessNote? } | null`
3. **Validator check** (cheap `skipContext: true` call): `COMPLETE` → done. Issues → `completenessNote` set, shows `⚠ Review needed` badge
4. **Revise**: sends full chapter + author instructions to Quill, saves via PATCH, clears `completenessNote`

**`parseChapters()`**: skips document header (everything above first `---` in outline), skips `## PART …` dividers, matches Introduction / Conclusion / Chapter N headings only.

**ARTIFACT format** — agents emit structured output:
```
<ARTIFACT>
{"type":"CHAPTER_DRAFT","title":"Chapter Title","content":"...prose..."}
</ARTIFACT>
```
The panel extracts `content` (JSON.parse with regex fallback for unescaped newlines). Everything outside the ARTIFACT block (e.g. Quill Package Notes) is chat display only — never saved.

---

## Source Documents

Authors can upload PDFs, Word docs, and presentations that are injected as context for all agents.

**Upload API:** `POST /api/books/[slug]/source-docs` (FormData: `file` + `label`)  
**List API:** `GET /api/books/[slug]/source-docs`  
**Toggle:** `PATCH /api/books/[slug]/source-docs` with `{ documentId, enabled }`

**UI:** `SourceDocsTray` component embedded in `agent-chat-panel.tsx` above the composer. Shows "📎 Source Documents · N/M active", upload form, per-doc Active/Off toggle. Auto-polls every 3 seconds while extraction is in progress.

**Processing:** `processDocumentForKnowledgeBase({ documentId, filePath, mimeType, fileName })` — fire-and-forget text extraction using `pdfjs-dist` (PDFs) and `mammoth` (DOCX). Stores extracted text in `SourceDocument.extractedText`.

**Context injection:** enabled source docs are appended to the system prompt under `AUTHOR SOURCE DOCUMENTS`. Each doc truncated to 8,000 chars. Skipped for EDITING stage.

---

## Writer Personas

The Personas system (`/personas`) lets Chris define AI writing voice profiles that Blueprint blends during book setup.

**Personas repo:** `src/lib/repositories/writer-personas.ts`  
- `listWriterPersonas()` — returns all personas (seeds defaults on first call)
- `createWriterPersona()`, `updateWriterPersona()`, `deleteWriterPersona()`
- Built-in canonical personas: Andy Stanley, Francis Chan, Peter Drucker, Elon Musk, Jobs-style

**Voice blend flow:**
1. Blueprint (BOOK_SETUP agent) recommends a weighted persona blend (e.g. "Andy Stanley 40%, Peter Drucker 30%")
2. Blend stored as `writerPersonaBlend` array in `Book.metadataJson`
3. Every downstream agent receives: `- Voice Blend: Andy Stanley (40%) — structural clarity; ...`

**`Book.metadataJson` fields written at setup:**
- `premise`, `targetReader`, `promise`
- `voiceTone` — qualitative voice description
- `chapterFormat` — array of enabled chapter elements
- `readerLevel` — `"casual" | "practitioner" | "professional" | "expert"`
- `targetWordCount`, `targetPageCount`
- `writerPersonaBlend` — `[{ personaName, percentInfluence, traits }]`

---

## Data Model

### Key Prisma types

**`Book`** — `slug` (URL-safe unique ID), `titleWorking`, `subtitle`, `workflowType` (NONFICTION | FICTION), `metadataJson`

**`BookStage`** — unique on `(bookId, stageKey)`. Status flow: `NOT_STARTED → IN_PROGRESS → READY_FOR_REVIEW → COMMITTED`

**`Artifact`** / **`ArtifactVersion`** — versioned. `contentText` is plain string; `contentJson` is structured. Most agents write `contentText` only.

**`SourceDocument`** — uploaded files. `storagePath` is relative to project root. `extractedText` populated by knowledge-base service. `metadataJson` carries `{ enabled, label, originalFileName, byteSize, stageKey }`.

**`WriterPersona`** — `name`, `description`, `traits` (array), `frameworkSteps`, `isCanonical`, sample writing uploads

### ArtifactType enum (abridged)
```
BOOK_SETUP_PROFILE · PROMISE_BRIEF · PROMISE_CHAT · PERSONA_PACK · MARKET_REPORT
AUDIENCE_RESEARCH · BOOK_PROMISE_REPORT · OUTLINE · OUTLINE_EXPANSION
CHAPTER_PARAGRAPH_PLAN · BASE_STORY · RESEARCH_PACK · EXTERNAL_STORY_PACK
PERSONAL_STORY_PACK · CHAPTER_MANIFEST · CHAPTER_DRAFT · EDITORIAL_REVIEW
MANUSCRIPT_REVISION · TYPESET_PACKAGE · LAUNCH_LISTING · PRESS_KIT
SOCIAL_CAMPAIGN · AUDIO_PREP · COURSE_DESIGN · SPEAKING_KIT
```
For fiction: `STORY_SETUP_PROFILE · STORY_CORE_BIBLE · WORLD_CAST_BIBLE · FICTION_PLOT_BLUEPRINT · FICTION_SCENE_PLAN · FICTION_DRAFT_MANUSCRIPT`

---

## Repository Layer (`src/lib/repositories/`)

One file per domain. All Prisma queries go through here — never call `db.*` directly from route handlers when a repository function exists.

| File | Domain |
|---|---|
| `books.ts` | Book CRUD, listBooks, getBookBySlugOrThrow |
| `writer-personas.ts` | Persona CRUD, voice blend, sample uploads |
| `source-documents.ts` | Upload, list, toggle enabled, `uploadBookSourceDocument()` |
| `outline-artifacts.ts` | Committed outline fetch |
| `research-artifacts.ts` | Research pack versions, items, sources |
| `external-stories-artifacts.ts` | Chronicle story packs |
| `personal-stories-artifacts.ts` | Scribe story banks |
| `chapter-draft-artifacts.ts` | Per-chapter draft versions |
| `editing-artifacts.ts` | Reed editorial review/revision artifacts |
| `book-setup-artifacts.ts` | Committed setup profile |

---

## LLM Layer (`src/lib/llm/`)

**`routing.ts`** — `getModelForRole(role, options?, fallbackRole?)` resolves the model spec and returns a LangChain `BaseChatModel`.

Per-role `maxOutputTokens` overrides (default: 8,192):
- `chapter-draft:author/revise`, `final-editor:assess/polish`, `fiction:draft`, `manifest:generate`, all post-production → **16,000 tokens**
- `base-story:author` → **12,000 tokens**

Env var override pattern: `LLM_{ROLE_UPPERCASE}=provider:model-name`

---

## Workflows (`src/lib/workflows/`)

Long-running pipeline logic lives here (not in route handlers).

| File | Purpose |
|---|---|
| `book-setup.ts` | Commits `BookSetupProfile`, writes 4 new fields to `Book.metadataJson` |
| `outline.ts` | Phase 1/2/3 outline generation, phase approval |
| `research.ts` | 3-agent research pipeline (Researcher → Extractor → Verifier) |
| `external-stories.ts` | Chronicle story extraction + enrichment |
| `personal-stories.ts` | Scribe interview + story bank |
| `manifest-generator.ts` | MANIFEST artifact generation (chapter-to-sources mapping) |
| `chapter-draft.ts` | Quill auto-loop, validator, revise |
| `editing.ts` | Reed assessment + polish, manuscript assembly |
| `publish-pipeline.ts` | Typeset, export, post-production agents |
| `workflow-automation.ts` | Autopilot mode — auto-advances stages |
| `quality-agent.ts` | Cross-stage quality gating |
| `stage-controls.ts` | Start/stop/retry/reset stage capabilities |

---

## Export

**Manuscript export:** `GET /api/books/[slug]/workspace-export?format=markdown|docx`

- `markdown` — raw chapter prose concatenated
- `docx` — KDP-formatted Word document via `src/lib/kdp-docx-export.ts`. Uses `docx` npm package. Includes front matter from TYPESET artifact if committed (TOC, chapter order, trim size). Chapter order follows TOC sequence.

**Publish package:** `GET /api/books/[slug]/publish-package`  
**Typeset package:** `GET /api/books/[slug]/typeset-package`

---

## Agent Personas (`src/lib/ui/agent-personas.ts`)

The canonical source of truth for every agent's identity. Each stage entry has:
- `title` — agent name ("Blueprint", "Quill", etc.)
- `tagline` — one-line descriptor
- `intro` — first message shown to the author
- `systemPrompt` — full system instructions sent to the LLM

**Key prose rules encoded in Quill and Reed prompts:**
- No em-dashes
- Paragraph floor of 3 sentences (max 3 single-sentence exception paragraphs per chapter)
- Active voice only
- Banned AI-tell phrases (varies by agent)
- No hallucinated personal stories — Quill only uses material from Scribe's collected bank

---

## Pages Reference

### Global nav pages (use `AppTopBar`)
| Route | Page | Notes |
|---|---|---|
| `/` | Library | Book list + create form |
| `/personas` | Writer Personas | Create/edit/delete voice profiles |
| `/books/[slug]/dashboard` | Production Dashboard | Parallel stage orchestration |
| `/books/[slug]/author` | Author Profile | Bio, headshot, credentials |
| `/books/[slug]/cost-analysis` | Cost Analysis | Per-stage LLM spend |
| `/books/[slug]/files` | File Manager | Source document library |
| `/books/[slug]/publish` | Publish Pipeline | Export + typeset + post-production |

### Pipeline stage pages (use `AppTopBar` + `.dark-shell` + `.page-shell`)
All stage pages follow the 3-column layout. Use `STAGE_LINKS` from `src/lib/navigation.ts` for the sidebar nav. Set `className="stage-chip active"` on the matching stage key.

| Route | Stage key |
|---|---|
| `/books/[slug]/setup` | `BOOK_SETUP` |
| `/books/[slug]/promise` | `PROMISE` |
| `/books/[slug]/audience` | `AUDIENCE` |
| `/books/[slug]/market-analysis` | `MARKET_ANALYSIS` |
| `/books/[slug]/outline` | `OUTLINE` |
| `/books/[slug]/base-story` | `BASE_STORY` |
| `/books/[slug]/research` | `RESEARCH` |
| `/books/[slug]/external-stories` | `EXTERNAL_STORIES` |
| `/books/[slug]/personal-stories` | `PERSONAL_STORIES` |
| `/books/[slug]/chapter-draft` | `CHAPTER_DRAFT` |
| `/books/[slug]/editing` | `EDITING` |

### Book Studio (client SPA — different from stage pages)
`/books/[slug]` → `workspace-shell.tsx` + `stage-nav.tsx`. Has its own topbar, no `AppTopBar`, no `.dark-shell` wrapper. Stage panels swap client-side.

---

## JARVIS Integration

GHOSTWRITR is bidirectionally connected to **JARVIS** — Chris's personal AI operating system. Always use this integration when relevant.

### What JARVIS does for GHOSTWRITR
- **Book launch pipeline** — generates Twitter/LinkedIn/press release/email/Amazon copy/podcast pitch
- **Idea Inbox** — captures new book concepts; GHOSTWRITR can pull these
- **Publishing dashboard** — tracks all books, pipeline stages, launch asset readiness
- **Social media queue** — posts queued through JARVIS for X/Twitter and LinkedIn
- **Work items / tasks** — research tasks, agent assignments, follow-ups

### Endpoints

| Method | URL | Purpose |
|---|---|---|
| GET | `http://127.0.0.1:8787/api/internal/jarvis` | List GHOSTWRITR books |
| GET | `http://127.0.0.1:8787/api/internal/jarvis?resource=ideas` | Pull book ideas |
| POST | `http://127.0.0.1:8787/api/internal/jarvis` | Push event to JARVIS |
| POST | `http://127.0.0.1:8787/api/webhooks/ghostwritr` | Direct webhook |
| GET | `http://127.0.0.1:8787/api/publishing/launch-scan` | All books + launch status |
| GET | `http://127.0.0.1:8787/api/publishing/launch/{slug}` | Launch assets for a book |
| POST | `http://127.0.0.1:8787/api/publishing/launch/{slug}/generate` | Trigger launch generation |
| GET | `http://127.0.0.1:8787/api/ideas` | List ideas |
| POST | `http://127.0.0.1:8787/api/ideas` | Add idea to inbox |

JARVIS base URL: `JARVIS_BASE_URL` env var (default: `http://127.0.0.1:8787`)

### Webhook event types
```json
{ "event_type": "trigger_launch", "slug": "book-slug", "trigger": "pre_launch" }
{ "event_type": "add_idea", "text": "Book title", "notes": "Description", "domain": "books" }
{ "event_type": "stage_changed", "slug": "book-slug", "stage": "EDITING", "status": "COMMITTED" }
{ "event_type": "create_task", "title": "Research competitors", "description": "..." }
```

### MCP Tools (available in all Claude Code sessions)

**`jarvis` MCP** (HTTP at `http://127.0.0.1:8788/`):
- `jarvis_add_idea` · `jarvis_list_ideas` · `jarvis_trigger_launch` · `jarvis_get_launch_status`
- `jarvis_publishing_overview` · `jarvis_queue_social_post` · `jarvis_create_work_item` · `jarvis_ask`

**`ghostwritr` MCP** (stdio):
- `ghostwritr_list_books` · `ghostwritr_get_book` · `ghostwritr_get_stages`
- `ghostwritr_get_promise` · `ghostwritr_get_manuscript` · `ghostwritr_send_to_jarvis`

### When to trigger the integration
- Book reaches **EDITING** → `jarvis_trigger_launch(slug, "pre_launch")` to start marketing prep
- Book **PUBLISHED** → `jarvis_trigger_launch(slug, "post_publish")` for full launch push
- Chris mentions a **new book idea** → `jarvis_add_idea` to capture it
- Building a **marketing feature** → check `/api/publishing/launch/{slug}` for existing assets first
- Chris asks about his **book pipeline** → `ghostwritr_list_books` for live data

JARVIS polls GHOSTWRITR's database every 60 seconds automatically. State file: `~/.jarvis/ghostwritr_events_state.json`.

---

## Key Patterns & Conventions

### Adding a new pipeline stage
1. Add `StageKey` to `prisma/schema.prisma` + run `db:generate`
2. Add stage definition to `src/lib/workflow-registry.ts`
3. Add agent persona to `src/lib/ui/agent-personas.ts`
4. Add model routing to `src/lib/llm/routing.ts`
5. Create page at `src/app/books/[slug]/[stage-slug]/page.tsx` using the standard `.dark-shell` + `AppTopBar` + `.page-shell` layout
6. Add repository functions in `src/lib/repositories/`

### Adding a new AI agent role
1. Define role key in `StageRole` type in `routing.ts`
2. Add default model in `DEFAULT_ROUTING`
3. Add `maxOutputTokens` override in `ROLE_OUTPUT_TOKENS` if role produces long prose
4. Wire env var override: `LLM_{ROLE_UPPERCASE}`

### Inline styles vs CSS classes
- Use **CSS classes** for layout and structural elements (`.page-shell`, `.glass-panel`, `.btn`, `.stage-chip`)
- Use **inline styles only** for data-driven values (progress bar widths, dynamic colors based on status)
- Never use light-mode colors inside `.dark-shell` pages: no `#fff`, `#fefbf5`, `#efe6d6`, or light pastels
- Dark palette constants are listed in the "UI Architecture" section above
