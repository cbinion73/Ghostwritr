/**
 * jarvis/client.ts — Server-side JARVIS integration for Ghostwritr
 * ================================================================
 * Fire-and-forget helper functions that push events from Ghostwritr
 * into JARVIS. All calls are non-blocking (background fetch with no
 * await in hot paths) so they never slow down the UI.
 *
 * JARVIS base URL comes from JARVIS_BASE_URL env var (default: http://127.0.0.1:8787).
 */

const JARVIS = (process.env.JARVIS_BASE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Core fire-and-forget POST
// ---------------------------------------------------------------------------

async function _post(path: string, body: Record<string, unknown>): Promise<void> {
  try {
    const res = await fetch(`${JARVIS}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.warn(`[JARVIS] POST ${path} → ${res.status}`);
    }
  } catch (err) {
    // Never throw — JARVIS being offline must not break Ghostwritr
    console.warn("[JARVIS] unreachable:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Stage lifecycle events
// ---------------------------------------------------------------------------

/**
 * Call when any stage is committed. JARVIS decides what to do based on
 * the stage key (e.g. EDITING → pre-launch prep, BOOK_SETUP → log new book).
 */
export function notifyStageCommitted(opts: {
  slug: string;
  stageKey: string;
  bookTitle: string;
}): void {
  // Fire and forget — do not await
  void _post("/api/webhooks/ghostwritr", {
    event_type: "stage_changed",
    slug: opts.slug,
    stage: opts.stageKey,
    status: "COMMITTED",
    title: opts.bookTitle,
    source: "ghostwritr",
  });
}

/**
 * Call when EDITING stage is committed — triggers JARVIS pre-launch
 * asset generation (Twitter, LinkedIn, press release, Amazon copy, etc.)
 */
export function triggerPreLaunch(opts: {
  slug: string;
  bookTitle: string;
}): void {
  console.log(`[JARVIS] Triggering pre-launch for "${opts.bookTitle}" (${opts.slug})`);
  void _post("/api/publishing/launch/" + encodeURIComponent(opts.slug) + "/generate", {
    force: false,
    trigger: "pre_launch",
  });
}

/**
 * Call when a book's status is set to PUBLISHED.
 */
export function triggerPostPublish(opts: {
  slug: string;
  bookTitle: string;
}): void {
  console.log(`[JARVIS] Triggering post-publish launch for "${opts.bookTitle}" (${opts.slug})`);
  void _post("/api/publishing/launch/" + encodeURIComponent(opts.slug) + "/generate", {
    force: false,
    trigger: "post_publish",
  });
}

// ---------------------------------------------------------------------------
// Idea sync
// ---------------------------------------------------------------------------

/**
 * Push a new book idea into the JARVIS Idea Inbox.
 * Use when a book is first set up so JARVIS tracks it from day one.
 */
export function syncBookToJarvis(opts: {
  slug: string;
  title: string;
  promise?: string;
  genre?: string;
}): void {
  void _post("/api/ideas", {
    text: opts.title,
    notes: opts.promise ?? "",
    domain: "books",
    tags: ["ghostwritr", "book", opts.slug, ...(opts.genre ? [opts.genre] : [])],
    source: "ghostwritr",
  });
}

/**
 * Call when any post-production stage is committed. Sends the full
 * artifact content to JARVIS so it can be surfaced in the launch panel
 * without JARVIS needing to re-generate it.
 */
export function notifyPostProductionCommitted(opts: {
  slug: string;
  bookTitle: string;
  stageKey: string;   // e.g. "LAUNCH_LISTING"
  agentName: string;  // e.g. "Marquee"
  artifactContent: string;
}): void {
  void _post("/api/webhooks/ghostwritr", {
    event_type: "post_production_committed",
    slug: opts.slug,
    title: opts.bookTitle,
    stage: opts.stageKey,
    agent: opts.agentName,
    content: opts.artifactContent,
    source: "ghostwritr",
  });
}

// ---------------------------------------------------------------------------
// Idea box — pull book ideas from JARVIS (async — use in server components)
// ---------------------------------------------------------------------------

export interface JarvisIdea {
  id: string;
  text: string;
  notes?: string;
  domain?: string;
  tags?: string[];
  source?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
}

/**
 * Pull all book-domain ideas from JARVIS.
 * Returns an empty array (never throws) if JARVIS is offline.
 */
export async function getBookIdeas(): Promise<JarvisIdea[]> {
  try {
    const res = await fetch(
      `${JARVIS}/api/ideas?domain=books`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { ideas?: JarvisIdea[] } | JarvisIdea[];
    return Array.isArray(data) ? data : (data.ideas ?? []);
  } catch {
    return [];
  }
}

/**
 * Update an idea in the JARVIS idea inbox (PATCH by ID).
 */
export async function updateBookIdea(id: string, patch: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${JARVIS}/api/ideas/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Delete an idea from the JARVIS idea inbox by ID.
 */
export async function deleteBookIdea(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${JARVIS}/api/ideas/${encodeURIComponent(id)}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Add a new idea to the JARVIS idea inbox.
 */
export async function addBookIdea(opts: {
  text: string;
  notes?: string;
  tags?: string[];
}): Promise<boolean> {
  try {
    const res = await fetch(`${JARVIS}/api/ideas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: opts.text,
        notes: opts.notes ?? "",
        domain: "books",
        tags: ["ghostwritr", ...(opts.tags ?? [])],
        source: "ghostwritr",
      }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Launch asset status check (async — use in server components/actions)
// ---------------------------------------------------------------------------

export async function getLaunchStatus(slug: string): Promise<{
  hasAssets: boolean;
  status: string | null;
  generatedAt: string | null;
}> {
  try {
    const res = await fetch(
      `${JARVIS}/api/publishing/launch/${encodeURIComponent(slug)}`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (res.status === 404) return { hasAssets: false, status: null, generatedAt: null };
    const data = await res.json() as { status?: string; generated_at?: string };
    return {
      hasAssets: true,
      status: data.status ?? null,
      generatedAt: data.generated_at ?? null,
    };
  } catch {
    return { hasAssets: false, status: null, generatedAt: null };
  }
}
