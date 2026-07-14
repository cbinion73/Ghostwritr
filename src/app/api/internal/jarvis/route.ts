/**
 * Ghostwritr ↔ JARVIS Internal API
 *
 * GET  /api/internal/jarvis          — list Ghostwritr books for JARVIS
 * GET  /api/internal/jarvis?resource=ideas — pull JARVIS ideas (book domain)
 * POST /api/internal/jarvis          — push event to JARVIS (stage change, trigger launch, etc.)
 */
import { NextRequest, NextResponse } from "next/server";
import { listBooks } from "@/lib/repositories/books";
import {
  JARVIS_INTERNAL_TOKEN_HEADER,
  validateInternalTokenAuth,
} from "@/lib/auth/shared";
import {
  RequestLimitError,
  parseLimitedJson,
  requestLimitResponse,
} from "@/lib/request-limits";

const JARVIS_BASE = process.env.JARVIS_BASE_URL ?? "http://127.0.0.1:8787";

function requireJarvisInternalAuth(req: NextRequest) {
  return validateInternalTokenAuth({
    headers: req.headers,
    envVarName: "GHOSTWRITR_JARVIS_INTERNAL_TOKEN",
    headerName: JARVIS_INTERNAL_TOKEN_HEADER,
    serviceName: "JARVIS internal API",
  });
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = requireJarvisInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const resource = req.nextUrl.searchParams.get("resource");

  // Pull JARVIS ideas (for "Book Ideas" view in Ghostwritr)
  if (resource === "ideas") {
    try {
      const res = await fetch(`${JARVIS_BASE}/api/ideas?domain=books`, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`JARVIS returned ${res.status}`);
      const data = await res.json();
      return NextResponse.json({ ok: true, ideas: data.ideas ?? data });
    } catch (err) {
      console.error("[JARVIS API] pull ideas failed:", err);
      return NextResponse.json({ ok: false, error: String(err), ideas: [] }, { status: 200 });
    }
  }

  // Default: list Ghostwritr books for JARVIS dashboard
  try {
    const books = await listBooks();
    return NextResponse.json({
      ok: true,
      books: books.map((book) => ({
        id: book.id,
        slug: book.slug,
        titleWorking: book.titleWorking,
        subtitle: book.subtitle,
        status: book.status,
        workflowType: book.workflowType,
        createdAt: book.createdAt,
        updatedAt: book.updatedAt,
        stages: book.stages?.map((stage) => ({
          id: stage.id,
          stageKey: stage.stageKey,
          status: stage.status,
          createdAt: stage.createdAt,
          updatedAt: stage.updatedAt,
        })) ?? [],
      })),
    });
  } catch (err) {
    console.error("[JARVIS API] listBooks failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

// ── POST ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = requireJarvisInternalAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await parseLimitedJson(req, { label: "JARVIS internal event" });
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { event_type, slug, ...payload } = body as {
    event_type: string;
    slug: string;
    [key: string]: unknown;
  };

  if (!event_type) {
    return NextResponse.json({ ok: false, error: "event_type is required" }, { status: 400 });
  }

  try {
    const res = await fetch(`${JARVIS_BASE}/api/webhooks/ghostwritr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type, slug, source: "ghostwritr", ...payload }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ ok: true, jarvis_response: data });
  } catch (err) {
    console.error("[JARVIS API] push event failed:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
