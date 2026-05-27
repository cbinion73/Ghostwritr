/**
 * Bibliography Generator — reads RESEARCH stage artifacts and produces a
 * Chicago-style bibliography for inclusion in the typeset package.
 *
 * Approach:
 *  1. Load research artifacts. If a consolidated mega-dossier exists, prefer it;
 *     otherwise fall back to individual chapter dossiers.
 *  2. Extract raw source strings from every "Evidence Map" table (### 3. Evidence Map).
 *     The table has columns: Claim | Supporting Sources | Tier | Notes.
 *     We pull the "Supporting Sources" column, which already contains author + title + URL.
 *  3. Deduplicate raw source strings (normalised lowercase comparison).
 *  4. Send deduplicated raw sources to Claude Haiku to convert to Chicago 17th edition.
 *  5. Return sorted citations + print-ready HTML.
 */

import { db } from "@/lib/db";
import { getModelForRole } from "@/lib/llm/routing";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// ── extract raw source strings from Evidence Map tables ─────────────────────

function extractRawSources(text: string): string[] {
  const sources: string[] = [];
  const lines = text.split("\n");

  let inEvidenceMap = false;
  let sourceColIndex = -1;

  for (const line of lines) {
    // Entering an Evidence Map section
    if (/^#{1,4}\s+\d*\.?\s*Evidence Map/i.test(line)) {
      inEvidenceMap = true;
      sourceColIndex = -1;
      continue;
    }

    if (!inEvidenceMap) continue;

    // Leaving an Evidence Map — a new heading at the same level signals the end
    if (/^#{1,4}\s+/.test(line) && !/Evidence Map/i.test(line)) {
      inEvidenceMap = false;
      sourceColIndex = -1;
      continue;
    }

    // Detect header row: | Claim | Supporting Sources | Tier | Notes |
    if (sourceColIndex === -1 && /\|\s*claim\s*\|/i.test(line)) {
      const cols = line.split("|").map((c) => c.trim().toLowerCase());
      sourceColIndex = cols.findIndex((c) =>
        /supporting sources?|sources?|citation/.test(c),
      );
      continue;
    }

    // Skip separator rows (|---|---|)
    if (/^\|[-\s|:]+\|$/.test(line)) continue;

    // Data rows
    if (sourceColIndex >= 0 && line.trim().startsWith("|")) {
      const cols = line.split("|").map((c) => c.trim());
      const raw = cols[sourceColIndex] ?? "";
      if (raw.length > 8) {
        // A single cell sometimes contains multiple sources separated by <br> or semicolon
        const parts = raw
          .split(/<br\s*\/?>/i)
          .flatMap((p) => p.split(/;\s*(?=[A-Z])/))
          .map((p) => p.trim())
          .filter((p) => p.length > 8);
        sources.push(...parts);
      }
    }
  }

  return sources;
}

// ── normalise key for deduplication ─────────────────────────────────────────

function normaliseKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "") // strip URLs for key comparison
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// ── Chicago HTML renderer ────────────────────────────────────────────────────

export function buildBibliographyHtml(
  bookTitle: string,
  citations: string[],
): string {
  if (citations.length === 0) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><title>Bibliography — ${escHtml(bookTitle)}</title></head>
<body>
<h1>Bibliography</h1>
<p><em>No citations were extracted from the research materials.</em></p>
</body>
</html>`;
  }

  const items = citations
    .map((c) => `  <p class="bib-entry">${escHtml(c)}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Bibliography — ${escHtml(bookTitle)}</title>
  <style>
    body { font-family: "Times New Roman", serif; font-size: 12pt; margin: 2.5cm; line-height: 1.6; }
    h1 { font-size: 16pt; margin-bottom: 1.5em; }
    .bib-entry { margin: 0 0 0.75em 2em; text-indent: -2em; }
  </style>
</head>
<body>
<h1>Bibliography</h1>
${items}
</body>
</html>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── main export ──────────────────────────────────────────────────────────────

export async function generateBibliography(
  bookId: string,
  bookTitle: string,
): Promise<{ citations: string[]; html: string }> {
  // 1. Load RESEARCH artifacts
  const researchStage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId, stageKey: "RESEARCH" } },
    select: {
      artifacts: {
        select: {
          title: true,
          versions: {
            select: { contentText: true },
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const artifacts = researchStage?.artifacts ?? [];
  if (artifacts.length === 0) {
    return { citations: [], html: buildBibliographyHtml(bookTitle, []) };
  }

  // 2. Prefer the consolidated mega-dossier if present (largest artifact by char count).
  //    Otherwise combine all individual dossiers.
  const withText = artifacts.filter((a) => (a.versions[0]?.contentText?.length ?? 0) > 0);
  const sorted = [...withText].sort(
    (a, b) =>
      (b.versions[0]?.contentText?.length ?? 0) -
      (a.versions[0]?.contentText?.length ?? 0),
  );
  const largest = sorted[0];

  let combinedText: string;
  if ((largest?.versions[0]?.contentText?.length ?? 0) > 100_000) {
    // Single consolidated dossier covers all chapters
    combinedText = largest!.versions[0]!.contentText!;
  } else {
    // Deduplicate individual dossiers by normalised title (keep latest)
    const seen = new Map<string, string>();
    for (const a of withText) {
      const key = (a.title ?? "").toLowerCase().trim();
      const text = a.versions[0]?.contentText ?? "";
      const existing = seen.get(key);
      if (!existing || text.length > existing.length) {
        seen.set(key, text);
      }
    }
    combinedText = Array.from(seen.values()).join("\n\n");
  }

  // 3. Extract raw source strings from Evidence Map tables
  const rawSources = extractRawSources(combinedText);
  if (rawSources.length === 0) {
    return { citations: [], html: buildBibliographyHtml(bookTitle, []) };
  }

  // 4. Deduplicate raw sources
  const seenKeys = new Set<string>();
  const uniqueSources: string[] = [];
  for (const s of rawSources) {
    const key = normaliseKey(s);
    if (key.length > 5 && !seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueSources.push(s);
    }
  }

  // 5. Call Haiku to format in Chicago 17th edition
  const model = await getModelForRole("manifest:generate"); // Haiku
  if (!model) {
    console.error("No model available for bibliography generation — check ANTHROPIC_API_KEY");
    return { citations: [], html: buildBibliographyHtml(bookTitle, []) };
  }

  const systemPrompt = `You are a professional academic editor specialising in Chicago Manual of Style (17th edition) bibliography formatting.

Given a list of raw source references (author name + title + URL, as extracted from research notes), convert each one to a properly formatted Chicago 17th edition bibliography entry.

Rules:
- Author Last, First. Year. *Title*. City: Publisher. OR for articles: Author Last, First. Year. "Article Title." *Journal* Volume (Issue): pages.
- For websites: Author Last, First. Year. "Page Title." Site Name. Accessed Month Day, Year. URL.
- If year is unknown, use "n.d."
- One entry per line
- Alphabetical order by author surname (or title if no author)
- Deduplicate — if the same source appears twice with slightly different wording, include it only once
- Output ONLY the numbered list (1., 2., …) — no preamble, no commentary, nothing else`;

  const userMessage = `Convert these raw source references for "${bookTitle}" into Chicago 17th edition bibliography entries:\n\n${uniqueSources.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;

  let raw = "";
  try {
    const stream = await model.stream([
      new SystemMessage(systemPrompt),
      new HumanMessage(userMessage),
    ]);
    for await (const chunk of stream) {
      const text =
        typeof chunk.content === "string"
          ? chunk.content
          : Array.isArray(chunk.content)
          ? chunk.content
              .filter(
                (c): c is { type: "text"; text: string } =>
                  typeof c === "object" && "text" in c,
              )
              .map((c) => c.text)
              .join("")
          : "";
      raw += text;
    }
  } catch (err) {
    console.error("Bibliography LLM call failed:", err);
    return { citations: [], html: buildBibliographyHtml(bookTitle, []) };
  }

  if (!raw.trim()) {
    console.error("LLM returned empty response — possible context length issue");
    return { citations: [], html: buildBibliographyHtml(bookTitle, []) };
  }

  // 6. Parse numbered list
  const lines = raw
    .split("\n")
    .map((l) => l.replace(/^\s*\d+\.\s*/, "").trim())
    .filter((l) => l.length > 10);

  // 7. Final dedup + sort
  const finalSeen = new Set<string>();
  const citations: string[] = [];
  for (const line of lines) {
    const key = normaliseKey(line);
    if (!finalSeen.has(key)) {
      finalSeen.add(key);
      citations.push(line);
    }
  }
  citations.sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

  return { citations, html: buildBibliographyHtml(bookTitle, citations) };
}
