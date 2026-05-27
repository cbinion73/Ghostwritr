import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { db } from "@/lib/db";
import { searchWeb } from "@/lib/web-access";
import { fetchTopPageTexts, formatSearchResults } from "../_research-helpers";

// ── Manifest helper functions ─────────────────────────────────────────────────

function extractChapterFromManifest(manifest: string, chapterTitle: string): string | null {
  const normalized = chapterTitle.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const lines = manifest.split("\n");
  let startIdx = -1;
  let endIdx = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^## /.test(line)) {
      const lineNorm = line.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      if (lineNorm.includes(normalized.slice(0, 20)) || normalized.includes(lineNorm.replace(/chapter \d+ /, "").slice(0, 20))) {
        startIdx = i;
      } else if (startIdx !== -1) {
        endIdx = i;
        break;
      }
    }
  }

  if (startIdx === -1) return null;
  return lines.slice(startIdx, endIdx).join("\n").trim();
}

function parseMaterialRefs(chapterSection: string): { scout: string[]; chronicle: string[]; personal: string[] } {
  const refs = { scout: [] as string[], chronicle: [] as string[], personal: [] as string[] };
  for (const line of chapterSection.split("\n")) {
    const scoutMatch = line.match(/^-\s+SCOUT:\s+([^|]+)/);
    if (scoutMatch?.[1]) refs.scout.push(scoutMatch[1].trim());
    const chronicleMatch = line.match(/^-\s+CHRONICLE:\s+([^|]+)/);
    if (chronicleMatch?.[1]) refs.chronicle.push(chronicleMatch[1].trim());
    const personalMatch = line.match(/^-\s+PERSONAL:\s+([^|]+)/);
    if (personalMatch?.[1]) refs.personal.push(personalMatch[1].trim());
  }
  refs.scout = [...new Set(refs.scout)];
  refs.chronicle = [...new Set(refs.chronicle)];
  refs.personal = [...new Set(refs.personal)];
  return refs;
}

async function fetchReferencedMaterials(
  bookId: string,
  refs: { scout: string[]; chronicle: string[]; personal: string[] },
): Promise<string> {
  const stageMap: Record<string, string[]> = {
    RESEARCH: refs.scout,
    EXTERNAL_STORIES: refs.chronicle,
    PERSONAL_STORIES: refs.personal,
  };

  const sections: string[] = [];

  for (const [sk, titles] of Object.entries(stageMap)) {
    if (titles.length === 0) continue;

    const stage = await db.bookStage.findUnique({
      where: { bookId_stageKey: { bookId, stageKey: sk as StageKey } },
      select: {
        artifacts: {
          select: {
            title: true,
            versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 },
          },
        },
      },
    });

    if (!stage) continue;

    for (const title of titles) {
      const artifact = stage.artifacts.find((a) => {
        const aTitle = (a.title ?? "").toLowerCase();
        const refTitle = title.toLowerCase();
        return aTitle.includes(refTitle.slice(0, 30)) || refTitle.includes(aTitle.slice(0, 30));
      });
      const text = artifact?.versions[0]?.contentText;
      if (text) {
        const prefix = sk === "RESEARCH" ? "SCOUT" : sk === "EXTERNAL_STORIES" ? "CHRONICLE" : "PERSONAL";
        sections.push(`=== ${prefix}: ${artifact?.title ?? title} ===\n${text}`);
      }
    }
  }

  return sections.join("\n\n");
}

// Allow up to 5 minutes for long chapter generation and editorial passes
export const maxDuration = 300;
import { getAgentForStage } from "@/lib/ui/agent-personas";
import { getModelForRole, resolveModelSpec } from "@/lib/llm/routing";
import { parseModelSpec } from "@/lib/llm/providers";
import { logLLMCall } from "@/lib/llm/call-log";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const book = await db.book.findUnique({
    where: { slug },
    select: { id: true, titleWorking: true, subtitle: true, workflowType: true, metadataJson: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = await req.json() as { stageKey: StageKey; messages: ChatMessage[]; chapterContext?: string; skipContext?: boolean; polishMode?: boolean };
  const { stageKey, messages, chapterContext, skipContext } = body;

  if (!stageKey || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing stageKey or messages" }, { status: 400 });
  }

  const persona = getAgentForStage(stageKey);

  // Reed escalates from assess (Sonnet) to polish (Opus) only when writing
  // revised prose. Detect by explicit flag or "revise"/"rewrite" in last message.
  const lastMessage = messages[messages.length - 1]?.content ?? "";
  const isRevisionRequest = body.polishMode === true
    || /\b(revise|rewrite|rework|polish this chapter|MANUSCRIPT_REVISION)\b/i.test(lastMessage);
  const effectiveRole = (stageKey === "EDITING" && isRevisionRequest)
    ? "final-editor:polish" as const
    : persona.stageRole;

  const model = await getModelForRole(effectiveRole);

  if (!model) {
    // No LLM available — return a canned response so the UI doesn't break
    const stream = buildStaticStream(
      `I need an API key configured to respond. Check that ${persona.stageRole.split(":")[0] === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"} is set in your .env.`,
    );
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  // ── Build prior-stage context ─────────────────────────────────────────────
  // skipContext: caller signals it only needs the role + brief (no manifest,
  // no prior stages, no source docs). Used by the completeness check to avoid
  // re-loading ~57K of context for a call that produces 5 tokens.
  // EDITING builds its own targeted context (manuscript + outline) in the block below —
  // the generic prior-stage build would load and then discard all those queries for nothing.
  const skipGenericContext = skipContext || stageKey === "EDITING" || stageKey === "TYPESET"
    || stageKey === "LAUNCH_LISTING" || stageKey === "PRESS_KIT" || stageKey === "SOCIAL_CAMPAIGN"
    || stageKey === "AUDIO_PREP" || stageKey === "COURSE_DESIGN" || stageKey === "SPEAKING_KIT";
  const stageOrder = skipGenericContext ? [] : getWorkflowStageKeys(book.workflowType);
  const currentIdx = skipGenericContext ? -1 : stageOrder.indexOf(stageKey);
  // Filter out undefined (defensive against enum mismatches) and MANIFEST
  // (Cartographer output is injected separately for CHAPTER_DRAFT; it's not
  // a conversational artifact other agents need in their generic context).
  // PERSONAL_STORIES (Scribe) is a personal interview — it needs the outline
  // and book brief but not the 100K+ research/story packs. Excluding RESEARCH
  // and EXTERNAL_STORIES from Scribe's context cuts input tokens by ~80%.
  const SCRIBE_SKIP = new Set<StageKey>(["RESEARCH", "EXTERNAL_STORIES", "BASE_STORY"]);
  const priorKeys = (currentIdx > 0 ? stageOrder.slice(0, currentIdx) : [])
    .filter((k): k is StageKey => Boolean(k) && k !== "MANIFEST" && (stageKey !== "PERSONAL_STORIES" || !SCRIBE_SKIP.has(k)));

  // Stages that accumulate multiple artifacts per chapter — load ALL saved artifacts,
  // not just take:1, so agents like Scribe can see all prior chapter dossiers.
  const MULTI_ARTIFACT_STAGES = new Set<StageKey>(["PERSONAL_STORIES", "CHAPTER_DRAFT", "EDITING"]);

  let priorContext = "";
  if (priorKeys.length > 0) {
    const priorStages = await db.bookStage.findMany({
      where: {
        bookId: book.id,
        stageKey: { in: priorKeys },
        status: { in: ["COMMITTED", "READY_FOR_REVIEW"] },
      },
      select: {
        stageKey: true,
        artifacts: {
          select: {
            title: true,
            versions: {
              select: { contentText: true },
              orderBy: { versionNumber: "desc" },
              take: 1,
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    const byKey = new Map(priorStages.map((s) => [s.stageKey, s]));
    const contextSections = priorKeys
      .map((key) => {
        const stage = byKey.get(key);
        const text = stage?.artifacts[0]?.versions[0]?.contentText;
        if (!text) return null;
        const title = stage?.artifacts[0]?.title ?? key.replace(/_/g, " ");
        return `=== ${title} (${key.replace(/_/g, " ")}) ===\n${text}`;
      })
      .filter(Boolean);

    if (contextSections.length > 0) {
      priorContext = `\n\nPRIOR COMMITTED STAGE OUTPUTS — use these as your foundation; do not re-derive:\n\n${contextSections.join("\n\n")}`;
    }
  }

  // ── Load same-stage prior artifacts for multi-artifact stages ────────────
  // Scribe needs to see ALL previously saved Personal Story Dossiers (not just
  // stage outputs before PERSONAL_STORIES). Similarly Quill can see prior chapters.
  let sameStageContext = "";
  if (!skipContext && MULTI_ARTIFACT_STAGES.has(stageKey)) {  // note: EDITING is allowed through here — Reed needs its prior review passes
    const currentBookStage = await db.bookStage.findUnique({
      where: { bookId_stageKey: { bookId: book.id, stageKey } },
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
          orderBy: { createdAt: "asc" }, // oldest first — chronological order
          // Cap prior Reed reviews at 1 most recent — each is 3–5K tokens at Opus pricing
          ...(stageKey === "EDITING" ? { take: 1, orderBy: { createdAt: "desc" } } : {}),
        },
      },
    });

    const savedDossiers = (currentBookStage?.artifacts ?? [])
      .map((a) => {
        const text = a.versions[0]?.contentText;
        if (!text) return null;
        return `=== ${a.title ?? stageKey.replace(/_/g, " ")} ===\n${text}`;
      })
      .filter(Boolean);

    if (savedDossiers.length > 0) {
      const label = stageKey === "PERSONAL_STORIES"
        ? "AUTHOR STORY NOTEBOOK — previously saved Personal Story Dossiers. Use these to avoid repeat questions, reuse confirmed stories, and track what Quill has already used"
        : stageKey === "EDITING"
          ? "PRIOR EDITORIAL REVIEWS — Reed's previous assessment passes"
          : "PRIOR CHAPTER DRAFTS — previously drafted chapters for this book";
      sameStageContext = `\n\n${label}:\n\n${savedDossiers.join("\n\n")}`;
    }
  }

  // ── EDITING: override priorContext with the full assembled manuscript ─────
  // Reed needs every chapter draft in order + the outline for structure reference.
  // Skip RESEARCH / EXTERNAL_STORIES / PERSONAL_STORIES — already integrated
  // into chapters by Quill; re-sending them doubles context with no gain.
  if (!skipContext && stageKey === "EDITING") {
    const [chapterStage, outlineStage] = await Promise.all([
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "CHAPTER_DRAFT" } },
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
            orderBy: { createdAt: "asc" }, // chronological chapter order
          },
        },
      }),
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "OUTLINE" } },
        select: {
          artifacts: {
            select: {
              versions: {
                select: { contentText: true },
                orderBy: { versionNumber: "desc" },
                take: 1,
              },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    // Deduplicate by normalized title — keep the longest version of each chapter.
    // Strip revision prefixes ("Revised: ", "Revised — ", etc.) before comparing
    // so retry drafts and manual revisions don't create phantom duplicate entries.
    function normalizeChapterTitle(raw: string): string {
      return raw
        .replace(/^(Revised|Updated|Edited|Final)[:\s–—-]+/i, "")
        .replace(/\s*—\s*/g, ": ")   // em-dash variant → colon form
        .replace(/\s+/g, " ")
        .trim();
    }

    const chapterMap = new Map<string, { title: string; text: string }>();
    for (const a of (chapterStage?.artifacts ?? [])) {
      const t = a.versions[0]?.contentText;
      if (!t || t.split(/\s+/).filter(Boolean).length < 100) continue; // skip stubs
      const rawTitle = (a.title ?? "Chapter").trim();
      const key = normalizeChapterTitle(rawTitle);
      const existing = chapterMap.get(key);
      // Keep the longest version; prefer the cleaner (non-prefixed) title
      if (!existing || t.length > existing.text.length) {
        const cleanTitle = !rawTitle.match(/^(Revised|Updated|Edited|Final)[:\s–—-]+/i)
          ? rawTitle
          : (existing?.title ?? key);
        chapterMap.set(key, { title: cleanTitle, text: t });
      }
    }
    const chapters = Array.from(chapterMap.values())
      .map(({ title, text }) => `=== ${title} ===\n${text}`);

    const outlineText = outlineStage?.artifacts[0]?.versions[0]?.contentText;

    let assembly = "";
    if (chapters.length > 0) {
      assembly += `\n\nFULL MANUSCRIPT — all drafted chapters in order. This is your primary editing input:\n\n${chapters.join("\n\n---\n\n")}`;
    }
    if (outlineText) {
      assembly += `\n\nBOOK OUTLINE — for structure reference:\n\n${outlineText}`;
    }

    // Replace the standard priorContext (which only loads take:1 per stage)
    priorContext = assembly;
  }

  // ── TYPESET: inject chapter summary + publishing package + Scout research ──
  // Folio needs chapter titles/word counts (not full prose) + the editing
  // publishing package + Scout research dossiers (for bibliography generation).
  if (!skipContext && stageKey === "TYPESET") {
    const [chapterStage, publishingStage, outlineStage, researchStage] = await Promise.all([
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "CHAPTER_DRAFT" } },
        select: {
          artifacts: {
            select: {
              title: true,
              versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "EDITING" } },
        select: {
          artifacts: {
            where: { artifactType: "PUBLISHING_PACKAGE" },
            select: { versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "OUTLINE" } },
        select: {
          artifacts: {
            select: { versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "RESEARCH" } },
        select: {
          artifacts: {
            select: {
              title: true,
              versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
    ]);

    // Build chapter summary (titles + word counts only, not full prose)
    const chapterSummary = (chapterStage?.artifacts ?? [])
      .filter((a) => {
        const t = a.versions[0]?.contentText;
        return t && t.split(/\s+/).filter(Boolean).length >= 100;
      })
      .map((a) => {
        const words = a.versions[0]?.contentText?.split(/\s+/).filter(Boolean).length ?? 0;
        const rawTitle = (a.title ?? "Chapter").trim();
        const cleanTitle = rawTitle.replace(/^(Revised|Updated|Edited|Final)[:\s–—-]+/i, "").trim();
        return `- ${cleanTitle} (${words.toLocaleString()} words)`;
      });

    const totalWords = (chapterStage?.artifacts ?? [])
      .filter((a) => (a.versions[0]?.contentText?.split(/\s+/).filter(Boolean).length ?? 0) >= 100)
      .reduce((sum, a) => sum + (a.versions[0]?.contentText?.split(/\s+/).filter(Boolean).length ?? 0), 0);

    const publishingPackageText = publishingStage?.artifacts[0]?.versions[0]?.contentText;
    const outlineText = outlineStage?.artifacts[0]?.versions[0]?.contentText;

    // Scout research — capped per dossier to keep context lean
    const RESEARCH_CAP = 3000;
    const researchSections = (researchStage?.artifacts ?? [])
      .map((a) => {
        const t = a.versions[0]?.contentText;
        if (!t) return null;
        const capped = t.length > RESEARCH_CAP ? t.slice(0, RESEARCH_CAP) + "\n…[truncated]" : t;
        return `=== SCOUT: ${a.title ?? "Research Dossier"} ===\n${capped}`;
      })
      .filter((s): s is string => s !== null);

    let assembly = "";
    if (chapterSummary.length > 0) {
      assembly += `\n\nMANUSCRIPT SUMMARY — chapter list for TOC generation:\nTotal: approximately ${totalWords.toLocaleString()} words across ${chapterSummary.length} chapters\n\n${chapterSummary.join("\n")}`;
    }
    if (publishingPackageText) {
      assembly += `\n\nPUBLISHING PACKAGE — from Reed's editorial assessment (trim specs, preflight, export plan):\n\n${publishingPackageText}`;
    }
    if (outlineText && !publishingPackageText) {
      // fallback: include outline for chapter order reference if no publishing package yet
      assembly += `\n\nBOOK OUTLINE — for chapter order reference:\n\n${outlineText}`;
    }
    if (researchSections.length > 0) {
      assembly += `\n\nSCOUT RESEARCH DOSSIERS — your source material for bibliography generation:\n\n${researchSections.join("\n\n")}`;
    }

    priorContext = assembly;
  }

  // ── POST-PRODUCTION: inject manuscript + outline + typeset package ───────
  // All 6 post-production agents need the finished book in context.
  // Prefer the EDITING committed artifact; fall back to assembled chapter drafts.
  // Also inject outline and typeset package where available.
  if (!skipContext && ["LAUNCH_LISTING", "PRESS_KIT", "SOCIAL_CAMPAIGN", "AUDIO_PREP", "COURSE_DESIGN", "SPEAKING_KIT"].includes(stageKey)) {
    const [editingStage, chapterStage, outlineStage, typesetStage] = await Promise.all([
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "EDITING" } },
        select: { artifacts: { where: { status: "COMMITTED" }, select: { versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 1 } },
      }),
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "CHAPTER_DRAFT" } },
        select: { artifacts: { where: { status: "COMMITTED" }, select: { title: true, versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } }, orderBy: { createdAt: "asc" } } },
      }),
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "OUTLINE" } },
        select: { artifacts: { select: { versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 1 } },
      }),
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "TYPESET" } },
        select: { artifacts: { where: { status: "COMMITTED" }, select: { versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 1 } },
      }),
    ]);

    let assembly = "";

    // Prefer EDITING committed artifact; fall back to assembled chapter drafts
    const editingText = editingStage?.artifacts[0]?.versions[0]?.contentText;
    if (editingText) {
      assembly += `\n\nFINAL MANUSCRIPT — editorially reviewed and committed:\n\n${editingText}`;
    } else if (chapterStage?.artifacts && chapterStage.artifacts.length > 0) {
      const chapters = chapterStage.artifacts
        .map((a) => { const t = a.versions[0]?.contentText; return t ? `=== ${a.title ?? "Chapter"} ===\n${t}` : null; })
        .filter(Boolean);
      if (chapters.length > 0) {
        assembly += `\n\nDRAFTED MANUSCRIPT — chapter drafts (editing not yet complete):\n\n${chapters.join("\n\n---\n\n")}`;
      }
    }

    const outlineText = outlineStage?.artifacts[0]?.versions[0]?.contentText;
    if (outlineText) assembly += `\n\nBOOK OUTLINE:\n\n${outlineText}`;

    const typesetText = typesetStage?.artifacts[0]?.versions[0]?.contentText;
    if (typesetText) assembly += `\n\nTYPESET PACKAGE (platform specs, ISBN, front matter):\n\n${typesetText}`;

    priorContext = assembly;
  }

  // ── LAUNCH_LISTING: pre-fetch live Amazon/KDP market data ────────────────
  // Marquee needs live search to do competitive positioning, keyword research,
  // and category discovery. We run 4 targeted queries before the LLM call
  // and inject the results as structured context — same pattern as Scout.
  let marketSearchContext = "";
  if (!skipContext && stageKey === "LAUNCH_LISTING") {
    try {
      const bookTitle   = book.titleWorking ?? "";
      const meta2 = book.metadataJson && typeof book.metadataJson === "object"
        ? book.metadataJson as Record<string, unknown> : {};
      const premise     = (meta2.premise as string) ?? "";
      const targetReader = (meta2.targetReader as string) ?? "";
      const subject     = [premise, bookTitle].filter(Boolean).join(" ").slice(0, 100);

      // Last user message — let Marquee drill into what the author just asked about
      const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
      const focusedQuery = lastUserMsg.length > 10 && lastUserMsg.length < 200
        ? lastUserMsg : null;

      const queries: string[] = [
        `Amazon KDP bestseller categories "${bookTitle}" nonfiction 2024 2025`,
        `Amazon best seller keyword research "${subject}" book`,
        `competing books "${subject}" Amazon description examples`,
        ...(targetReader ? [`Amazon nonfiction books "${targetReader}" bestseller list`] : []),
        ...(focusedQuery ? [focusedQuery] : []),
      ].slice(0, 5);

      const { results, attempts } = await searchWeb(queries, { perQueryLimit: 4, totalLimit: 16 });
      const pageTexts = await fetchTopPageTexts(results, 5, 3000);
      marketSearchContext = formatSearchResults(results, attempts, "LIVE AMAZON/KDP MARKET DATA", pageTexts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Search failed";
      marketSearchContext = `\n\nMARKET SEARCH: Search failed (${msg}). Use training knowledge for category/keyword guidance and note that data may not reflect current rankings.`;
    }
  }

  // ── CHAPTER_DRAFT: use manifest for targeted context injection ────────────
  // Instead of dumping all 197K tokens of research/stories, load the manifest
  // and inject only the materials assigned to this specific chapter.
  if (!skipContext && stageKey === "CHAPTER_DRAFT" && chapterContext) {
    const [manifestStage, outlineStage] = await Promise.all([
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "MANIFEST" } },
        select: {
          artifacts: {
            select: { versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
      db.bookStage.findUnique({
        where: { bookId_stageKey: { bookId: book.id, stageKey: "OUTLINE" } },
        select: {
          artifacts: {
            select: { versions: { select: { contentText: true }, orderBy: { versionNumber: "desc" }, take: 1 } },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    const manifestContent = manifestStage?.artifacts[0]?.versions[0]?.contentText;
    const outlineContent = outlineStage?.artifacts[0]?.versions[0]?.contentText;

    if (manifestContent) {
      const chapterSection = extractChapterFromManifest(manifestContent, chapterContext);

      if (chapterSection) {
        const materialRefs = parseMaterialRefs(chapterSection);
        const targetedMaterials = await fetchReferencedMaterials(book.id, materialRefs);

        priorContext = `\n\nCHAPTER MANIFEST — your writing brief for "${chapterContext}":\n\n${chapterSection}`;
        if (targetedMaterials) {
          priorContext += `\n\nSOURCE MATERIALS — only what's assigned to this chapter:\n\n${targetedMaterials}`;
        }
        if (outlineContent) {
          priorContext += `\n\nBOOK OUTLINE — for chapter structure reference:\n\n${outlineContent}`;
        }
      } else {
        // Chapter not found in manifest — fall back to outline only
        if (outlineContent) {
          priorContext = `\n\nBOOK OUTLINE:\n\n${outlineContent}`;
        }
      }
    } else {
      // No manifest generated yet — use outline only to stay well within context window.
      // The full research/stories dump (~200K tokens) exhausts context and silently
      // truncates the system prompt, which causes short, instruction-ignoring output.
      if (outlineContent) {
        priorContext = `\n\nBOOK OUTLINE:\n\n${outlineContent}`;
      } else {
        priorContext = ""; // Clear the 200K dump — better to write with no context than truncated context
      }
    }
  }

  // ── Also pull source documents (brainstorm uploads) ───────────────────────
  // Source docs are raw brainstorm uploads — Quill integrates them, Reed does not need them.
  // Only inject docs where enabled is not explicitly false (absent = enabled).
  const skipSourceDocs = skipContext
    || stageKey === "EDITING"
    || stageKey === "TYPESET"
    || stageKey === "LAUNCH_LISTING"
    || stageKey === "PRESS_KIT"
    || stageKey === "SOCIAL_CAMPAIGN"
    || stageKey === "AUDIO_PREP"
    || stageKey === "COURSE_DESIGN"
    || stageKey === "SPEAKING_KIT";

  const sourceDocs = skipSourceDocs ? [] : await db.sourceDocument.findMany({
    where: {
      bookId: book.id,
      category: "USER_UPLOAD",
      // Exclude docs explicitly disabled — absent enabled key means active
      NOT: { metadataJson: { path: ["enabled"], equals: false } },
    },
    select: { title: true, extractedText: true },
  });

  const MAX_SOURCE_DOC_CHARS = 8000;

  let sourceDocContext = "";
  if (sourceDocs.length > 0) {
    const docSections = sourceDocs
      .filter((d) => d.extractedText)
      .map((d) => {
        const text = d.extractedText!.length > MAX_SOURCE_DOC_CHARS
          ? d.extractedText!.slice(0, MAX_SOURCE_DOC_CHARS) + "\n[...truncated — full document available in the Files tab]"
          : d.extractedText!;
        return `=== ${d.title} ===\n${text}`;
      });
    if (docSections.length > 0) {
      sourceDocContext = `\n\nAUTHOR SOURCE DOCUMENTS (author-uploaded foundational material — treat as your primary reference for voice, frameworks, and prior work):\n\n${docSections.join("\n\n")}`;
    }
  }

  // Extract brief metadata written at book creation time and from BOOK_SETUP commit
  const meta = book.metadataJson && typeof book.metadataJson === "object" ? book.metadataJson as Record<string, unknown> : {};
  // Voice blend: prefer the structured weighted blend; fall back to plain reference notes
  type PersonaBlendEntry = { personaName?: string; percentInfluence?: number; traits?: string[] };
  const blendEntries = Array.isArray(meta.writerPersonaBlend)
    ? (meta.writerPersonaBlend as PersonaBlendEntry[])
    : [];
  const voiceBlendLine = blendEntries.length > 0
    ? `- Voice Blend: ${blendEntries
        .map((p) => {
          const name = p.personaName ?? "Unknown";
          const pct  = p.percentInfluence != null ? `${p.percentInfluence}%` : "";
          const qual = p.traits?.length ? ` — ${p.traits.join(", ")}` : "";
          return `${name}${pct ? ` (${pct})` : ""}${qual}`;
        })
        .join("; ")}`
    : Array.isArray(meta.voiceReferenceNotes) && (meta.voiceReferenceNotes as string[]).length > 0
      ? `- Voice References: ${(meta.voiceReferenceNotes as string[]).join("; ")}`
      : "";

  const briefLines = [
    meta.premise         ? `- Premise: ${meta.premise}` : "",
    meta.targetReader    ? `- Target Reader: ${meta.targetReader}` : "",
    meta.promise         ? `- Core Promise: ${meta.promise}` : "",
    meta.voiceTone       ? `- Author Voice: ${meta.voiceTone}` : "",
    voiceBlendLine,
    meta.chapterFormat   ? `- Chapter Format: ${(meta.chapterFormat as string[]).join(", ")}` : "",
    meta.readerLevel     ? `- Reader Level: ${meta.readerLevel}` : "",
    meta.targetWordCount ? `- Target Word Count: ${Number(meta.targetWordCount).toLocaleString()} words` : "",
    meta.targetPageCount ? `- Target Page Count: ${meta.targetPageCount} pages` : "",
    meta.authorBioShort  ? `- Author Bio: ${meta.authorBioShort}` : "",
  ].filter(Boolean).join("\n");

  const systemContent = `${persona.systemPrompt}

Book context:
- Title: ${book.titleWorking ?? "(untitled)"}${book.subtitle ? `\n- Subtitle: ${book.subtitle}` : ""}
${briefLines ? briefLines + "\n" : ""}- You are speaking with the author about Stage: ${stageKey.replace(/_/g, " ").toLowerCase()}${chapterContext ? `\n- Current chapter: ${chapterContext}` : ""}

Always stay in character as ${persona.name}. Be concise. End your response with a question or a clear next step.

ARTIFACT PRODUCTION:
When asked to "draft the artifact" or "produce the artifact for this stage", output your structured result wrapped in an ARTIFACT block:

<ARTIFACT>
{"type":"[STAGE_KEY]","title":"...","content":"..."}
</ARTIFACT>

The "content" field should be the full artifact text (can be multi-paragraph prose, JSON, or structured markdown). Keep the ARTIFACT block at the end of your response.${sameStageContext}${priorContext}${sourceDocContext}

PROSE VOICE RULES — these apply to every word you write. No exceptions.${marketSearchContext}
- NO EM-DASHES. Not a single one. Replace every (--) and every (--) with a comma, colon, semicolon, or period. If you catch yourself about to write one, stop and restructure the sentence.
- BANNED WORDS AND PHRASES. Never use any of these: "delve", "dive into", "unpack", "explore" (as a verb for ideas), "it's important to note", "it's worth noting", "moreover", "furthermore", "in conclusion", "to summarize", "stands as a testament", "in the realm of", "at its core", "in essence", "at the end of the day", "when it comes to", "in terms of", "simply put", "put simply", "with that in mind", "that said", "having said that", "as we've seen", "moving forward", "going forward", "leverage" (use "use"), "utilize" (use "use"), "not only... but also", "game-changing", "groundbreaking", "transformative", "seamlessly", "robust", "foster", "underscore", "navigate", "unlock", "harness", "empower", "elevate", "holistic", "synergy", "paradigm", "cutting-edge", "ultimately", "essentially", "fundamentally", "undoubtedly", "needless to say", "of course" (as a filler), "clearly" (as a filler), "obviously".
- Do not start consecutive sentences with "The".
- PARAGRAPH RULE — enforced, not suggested. Every body paragraph must contain at least 3 sentences. A single-sentence paragraph is only permitted in three situations: (1) the chapter's opening hook, (2) a deliberate hard turn that must land alone, (3) the chapter's closing line. Three single-sentence moments maximum per chapter. Before closing the ARTIFACT, scan your output — any paragraph under 3 sentences that is not one of those three moments must be expanded or merged. Consecutive short paragraphs are a failure mode, not a style choice.
- Write like a published author who has read the book three times, not a model completing a prompt.
- Active voice. Name the subject. Let them do things.
- No throat-clearing. Start sentences with the point, not a windup.`;

  const { HumanMessage, SystemMessage, AIMessage } = await import("@langchain/core/messages");

  const langchainMessages = [
    new SystemMessage(systemContent),
    ...messages.map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
  ];

  const encoder = new TextEncoder();

  const modelSpec = parseModelSpec(resolveModelSpec(effectiveRole));
  const startMs = Date.now();

  const readable = new ReadableStream({
    async start(controller) {
      let promptTokens = 0;
      let completionTokens = 0;

      try {
        const stream = await model.stream(langchainMessages);
        for await (const chunk of stream) {
          const text =
            typeof chunk.content === "string"
              ? chunk.content
              : Array.isArray(chunk.content)
                ? chunk.content
                    .filter((c): c is { type: "text"; text: string } => typeof c === "object" && "text" in c)
                    .map((c) => c.text)
                    .join("")
                : "";
          if (text) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
            );
          }
          // Capture token usage from the chunk metadata (last chunk usually has it)
          const usage = (chunk as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
          if (usage) {
            if (usage.input_tokens) promptTokens = usage.input_tokens;
            if (usage.output_tokens) completionTokens = usage.output_tokens;
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ text: `\n\n⚠ ${msg}` })}\n\n`),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
        // Log cost after stream closes (fire-and-forget)
        if (promptTokens > 0 || completionTokens > 0) {
          void logLLMCall({
            bookId:       book.id,
            bookSlug:     slug,
            bookTitle:    book.titleWorking ?? undefined,
            stageKey:     stageKey,
            stageRole:    persona.stageRole,
            provider:     modelSpec.provider,
            model:        modelSpec.model,
            promptTokens,
            completionTokens,
            durationMs:   Date.now() - startMs,
          }).catch(() => {/* non-fatal */});
        }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function buildStaticStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
