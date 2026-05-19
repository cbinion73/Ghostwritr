/**
 * Shared helpers for web-search-backed agent routes (Scout, Chronicle, etc.)
 */

import { db } from "@/lib/db";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";
import { searchWeb, summarizeSearchAttempts } from "@/lib/web-access";
import type { BookWorkflowType, StageKey } from "@prisma/client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Chapter topic extraction ──────────────────────────────────────────────────

export function extractChapterTopics(outlineText: string, bookTitle: string): string[] {
  const lines = outlineText.split("\n");
  const topics: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const chapterMatch = trimmed.match(
      /^(?:#{1,3}\s*)?(?:chapter\s+\d+[:\-.]?\s+|^\d+[.:]\s+)(.+)/i
    );
    if (chapterMatch) {
      const title = chapterMatch[1].replace(/\*\*/g, "").trim();
      if (title.length > 3) topics.push(title);
      continue;
    }
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*$/);
    if (boldMatch) {
      const title = boldMatch[1].trim();
      if (title.length > 5 && !title.toLowerCase().startsWith("outline")) {
        topics.push(title);
      }
    }
  }

  if (topics.length === 0 && bookTitle) topics.push(bookTitle);
  return topics.slice(0, 6);
}

// ── User focus extraction ─────────────────────────────────────────────────────

export function extractUserQueryFocus(messages: ChatMessage[]): string | null {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return null;
  const text = lastUser.content.toLowerCase();

  const chapterRef = lastUser.content.match(/chapter\s+\d+[:\-.]?\s*(.+?)(?:\.|$)/i);
  if (chapterRef) return chapterRef[1].trim();

  const topicRef = lastUser.content.match(
    /research\s+(?:the\s+)?(?:topic\s+)?[""']?(.+?)[""']?(?:\s+chapter|\s+section|\.|$)/i
  );
  if (topicRef) return topicRef[1].trim();

  if (
    text.includes("draft") ||
    text.includes("artifact") ||
    text.includes("produce") ||
    text.includes("generate")
  ) {
    return null;
  }

  return null;
}

// ── Query builders ────────────────────────────────────────────────────────────

export function buildResearchQueries(
  topics: string[],
  userFocus: string | null,
  bookSubject: string
): string[] {
  if (userFocus) {
    return [
      `${userFocus} research statistics`,
      `${userFocus} ${bookSubject}`,
    ].slice(0, 3);
  }
  const queries: string[] = [];
  for (const topic of topics.slice(0, 3)) {
    queries.push(`${topic} ${bookSubject} research`);
  }
  if (bookSubject && !queries.some((q) => q.includes(bookSubject))) {
    queries.unshift(`${bookSubject} latest research statistics`);
  }
  return queries.slice(0, 4);
}

export function buildStoryQueries(
  topics: string[],
  userFocus: string | null,
  bookSubject: string
): string[] {
  if (userFocus) {
    return [
      `${userFocus} real world example case study`,
      `${userFocus} famous story anecdote`,
    ].slice(0, 3);
  }
  const queries: string[] = [];
  for (const topic of topics.slice(0, 3)) {
    queries.push(`${topic} real world case study example`);
  }
  if (bookSubject) {
    queries.push(`${bookSubject} famous example business history`);
  }
  return queries.slice(0, 4);
}

// ── Search result formatter ───────────────────────────────────────────────────

export function formatSearchResults(
  results: Array<{ title: string; url: string; snippet?: string | null; query: string }>,
  attemptsObj: Awaited<ReturnType<typeof searchWeb>>["attempts"],
  label: string
): string {
  const attemptSummary = summarizeSearchAttempts(attemptsObj);
  if (results.length === 0) {
    return `\n\n${label}: No results retrieved. ${attemptSummary} Use training knowledge and clearly note which claims are unverified.`;
  }

  const grouped = new Map<string, typeof results>();
  for (const r of results) {
    const group = grouped.get(r.query) ?? [];
    group.push(r);
    grouped.set(r.query, group);
  }

  const sections: string[] = [];
  for (const [query, items] of grouped) {
    const lines = items.map(
      (r, i) =>
        `  [${i + 1}] ${r.title}\n      URL: ${r.url}${r.snippet ? `\n      Snippet: ${r.snippet}` : ""}`
    );
    sections.push(`Search: "${query}"\n${lines.join("\n")}`);
  }

  return `\n\n${label} — cite these with their URL when used:\n\n${sections.join("\n\n")}\n\nSearch summary: ${attemptSummary}`;
}

// ── Prior stage context loader ────────────────────────────────────────────────

export async function loadPriorContext(
  bookId: string,
  workflowType: BookWorkflowType,
  currentStageKey: StageKey
): Promise<{ priorContext: string; outlineText: string; sourceDocContext: string }> {
  const stageOrder = getWorkflowStageKeys(workflowType);
  const currentIdx = stageOrder.indexOf(currentStageKey);
  const priorKeys = currentIdx > 0 ? stageOrder.slice(0, currentIdx) : [];

  let outlineText = "";
  let priorContext = "";

  if (priorKeys.length > 0) {
    const priorStages = await db.bookStage.findMany({
      where: {
        bookId,
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
    const outlineStage = byKey.get("OUTLINE");
    outlineText = outlineStage?.artifacts[0]?.versions[0]?.contentText ?? "";

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
      priorContext = `\n\nPRIOR COMMITTED STAGE OUTPUTS — use these as your foundation:\n\n${contextSections.join("\n\n")}`;
    }
  }

  const sourceDocs = await db.sourceDocument.findMany({
    where: { bookId, category: "USER_UPLOAD" },
    select: { title: true, extractedText: true },
  });

  let sourceDocContext = "";
  const docSections = sourceDocs
    .filter((d) => d.extractedText)
    .map((d) => `=== ${d.title} ===\n${d.extractedText}`);
  if (docSections.length > 0) {
    sourceDocContext = `\n\nAUTHOR SOURCE DOCUMENTS:\n\n${docSections.join("\n\n")}`;
  }

  return { priorContext, outlineText, sourceDocContext };
}

// ── Static SSE stream ─────────────────────────────────────────────────────────

export function buildStaticStream(text: string): ReadableStream {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
