import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAgentForStage } from "@/lib/ui/agent-personas";
import { getModelForRole, resolveModelSpec } from "@/lib/llm/routing";
import { parseModelSpec } from "@/lib/llm/providers";
import { logLLMCall } from "@/lib/llm/call-log";
import { getWorkflowStageKeys } from "@/lib/workflow-registry";
import { searchWeb, summarizeSearchAttempts } from "@/lib/web-access";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Extract chapter/section headings from outline text for query generation
function extractChapterTopics(outlineText: string, bookTitle: string): string[] {
  const lines = outlineText.split("\n");
  const topics: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Match: "Chapter N: Title", "## Chapter", "1. Title", "- Chapter N" patterns
    const chapterMatch = trimmed.match(
      /^(?:#{1,3}\s*)?(?:chapter\s+\d+[:\-.]?\s+|^\d+[.:]\s+)(.+)/i
    );
    if (chapterMatch) {
      const title = chapterMatch[1].replace(/\*\*/g, "").trim();
      if (title.length > 3) topics.push(title);
      continue;
    }
    // Match bold headings that look like chapter titles: **Chapter Title**
    const boldMatch = trimmed.match(/^\*\*(.+?)\*\*$/);
    if (boldMatch) {
      const title = boldMatch[1].trim();
      if (title.length > 5 && !title.toLowerCase().startsWith("outline")) {
        topics.push(title);
      }
    }
  }

  // If no chapter structure found, use the book title itself
  if (topics.length === 0 && bookTitle) {
    topics.push(bookTitle);
  }

  return topics.slice(0, 6);
}

// Extract the core topic the user is asking about from their last message
function extractUserQueryFocus(messages: ChatMessage[]): string | null {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return null;
  const text = lastUser.content.toLowerCase();

  // If asking about a specific chapter, extract it
  const chapterRef = lastUser.content.match(
    /chapter\s+\d+[:\-.]?\s*(.+?)(?:\.|$)/i
  );
  if (chapterRef) return chapterRef[1].trim();

  // If asking to research a specific topic
  const topicRef = lastUser.content.match(
    /research\s+(?:the\s+)?(?:topic\s+)?[""']?(.+?)[""']?(?:\s+chapter|\s+section|\.|$)/i
  );
  if (topicRef) return topicRef[1].trim();

  // If it's just "draft the artifact" or similar, return null (use outline topics)
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

function buildSearchQueries(
  topics: string[],
  bookTitle: string,
  userFocus: string | null,
  bookSubject: string
): string[] {
  const queries: string[] = [];

  // If user asked about something specific, prioritize that
  if (userFocus) {
    queries.push(`${userFocus} research statistics`);
    queries.push(`${userFocus} ${bookSubject}`);
    return queries.slice(0, 3);
  }

  // Build queries from chapter topics + book subject
  for (const topic of topics.slice(0, 3)) {
    queries.push(`${topic} ${bookSubject} research`);
  }

  // Add a broad query for the book's core subject
  if (bookSubject && !queries.some((q) => q.includes(bookSubject))) {
    queries.unshift(`${bookSubject} latest research statistics`);
  }

  return queries.slice(0, 4);
}

// Format search results into a context block for the system prompt
function formatSearchResults(
  results: Array<{ title: string; url: string; snippet?: string | null; query: string }>,
  attempts: ReturnType<typeof summarizeSearchAttempts>
): string {
  if (results.length === 0) {
    return `\n\nWEB RESEARCH: No results retrieved. ${attempts} Use your training knowledge and clearly note which claims are from training data versus verified sources.`;
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

  return `\n\nWEB RESEARCH RESULTS — ground your response in these real sources. Cite them with their URL when used:\n\n${sections.join("\n\n")}\n\nSearch summary: ${attempts}`;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const book = await db.book.findUnique({
    where: { slug },
    select: {
      id: true,
      titleWorking: true,
      subtitle: true,
      workflowType: true,
      metadataJson: true,
    },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = (await req.json()) as {
    messages: ChatMessage[];
    chapterContext?: string;
  };
  const { messages, chapterContext } = body;

  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  const stageKey = "RESEARCH" as const;
  const persona = getAgentForStage(stageKey);
  const model = await getModelForRole(persona.stageRole);

  if (!model) {
    const stream = buildStaticStream(
      "I need ANTHROPIC_API_KEY configured to run research. Check your .env file."
    );
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  // ── Load prior stage context (same as agent-chat route) ──────────────────
  const stageOrder = getWorkflowStageKeys(book.workflowType);
  const currentIdx = stageOrder.indexOf(stageKey);
  const priorKeys = currentIdx > 0 ? stageOrder.slice(0, currentIdx) : [];

  let outlineText = "";
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

    // Extract outline specifically for search query generation
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

  // ── Source documents ──────────────────────────────────────────────────────
  const sourceDocs = await db.sourceDocument.findMany({
    where: { bookId: book.id, category: "USER_UPLOAD" },
    select: { title: true, extractedText: true },
  });

  let sourceDocContext = "";
  if (sourceDocs.length > 0) {
    const docSections = sourceDocs
      .filter((d) => d.extractedText)
      .map((d) => `=== ${d.title} ===\n${d.extractedText}`);
    if (docSections.length > 0) {
      sourceDocContext = `\n\nAUTHOR SOURCE DOCUMENTS:\n\n${docSections.join("\n\n")}`;
    }
  }

  // ── Run web searches ──────────────────────────────────────────────────────
  const meta =
    book.metadataJson && typeof book.metadataJson === "object"
      ? (book.metadataJson as Record<string, string>)
      : {};

  const bookSubject = [meta.premise, book.titleWorking]
    .filter(Boolean)
    .join(" ")
    .slice(0, 80);

  const chapterTopics = extractChapterTopics(
    outlineText,
    book.titleWorking ?? "book"
  );
  const userFocus = extractUserQueryFocus(messages);
  const queries = buildSearchQueries(
    chapterTopics,
    book.titleWorking ?? "",
    userFocus,
    bookSubject
  );

  // Send an immediate SSE event so the UI knows research is underway
  const encoder = new TextEncoder();

  // Run searches (non-blocking — we'll inject results into context)
  let searchContext = "";
  try {
    const { results, attempts } = await searchWeb(queries, {
      perQueryLimit: 5,
      totalLimit: 15,
    });
    const attemptSummary = summarizeSearchAttempts(attempts);
    searchContext = formatSearchResults(results, attemptSummary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    searchContext = `\n\nWEB RESEARCH: Search encountered an error (${msg}). Use training knowledge and flag unverified claims.`;
  }

  // ── Build system prompt ───────────────────────────────────────────────────
  const briefLines = [
    meta.premise ? `- Premise: ${meta.premise}` : "",
    meta.targetReader ? `- Target Reader: ${meta.targetReader}` : "",
    meta.promise ? `- Core Promise: ${meta.promise}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const systemContent = `${persona.systemPrompt}

Book context:
- Title: ${book.titleWorking ?? "(untitled)"}${book.subtitle ? `\n- Subtitle: ${book.subtitle}` : ""}
${briefLines ? briefLines + "\n" : ""}- You are speaking with the author about Stage: research${chapterContext ? `\n- Current chapter: ${chapterContext}` : ""}

Always stay in character as ${persona.name}. Be concise. End your response with a question or a clear next step.

PROSE VOICE RULES — apply whenever writing or drafting any content:
- No em-dashes (—). Use a comma, colon, semicolon, or period instead.
- Banned words and phrases: "delve", "dive into", "unpack", "explore", "it's important to note", "moreover", "furthermore", "in conclusion", "to summarize", "stands as a testament", "in the realm of", "at its core", "leverage" (use "use"), "utilize" (use "use"), "not only... but also", "game-changing", "groundbreaking", "seamlessly", "robust", "foster", "underscore", "navigate".
- Do not start consecutive sentences with "The".
- Vary sentence length. Short sentences hit hard. Longer ones carry nuance and flow.
- Write like a smart human who has edited their own work.
- Prefer active voice. Cut hedges unless uncertainty is the actual point.

RESEARCH AGENT RULES:
- Every statistic you cite MUST come from the web research results below or your verified training knowledge — label which.
- Format citations inline: (Source: [Title], [URL])
- If you cannot verify a claim, say "Unverified — check before using" rather than stating it as fact.
- When drafting the Research Pack artifact, organize by chapter and include 3-5 verified findings per chapter with source citations.

ARTIFACT PRODUCTION:
When asked to "draft the artifact" or "produce the artifact for this stage", output your structured result wrapped in an ARTIFACT block:

<ARTIFACT>
{"type":"RESEARCH","title":"Research Pack","content":"..."}
</ARTIFACT>

The "content" field should be a comprehensive Research Pack: for each chapter in the outline, list 3-5 key facts, statistics, or findings with source citations.${priorContext}${sourceDocContext}${searchContext}`;

  const { HumanMessage, SystemMessage, AIMessage } = await import(
    "@langchain/core/messages"
  );

  const langchainMessages = [
    new SystemMessage(systemContent),
    ...messages.map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)
    ),
  ];

  const modelSpec = parseModelSpec(resolveModelSpec(persona.stageRole));
  const startMs = Date.now();

  const readable = new ReadableStream({
    async start(controller) {
      let promptTokens = 0;
      let completionTokens = 0;

      // Let the user know search ran
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            text: queries.length > 0
              ? `*Searched: ${queries.map((q) => `"${q}"`).join(", ")}*\n\n`
              : "",
          })}\n\n`
        )
      );

      try {
        const stream = await model.stream(langchainMessages);
        for await (const chunk of stream) {
          const text =
            typeof chunk.content === "string"
              ? chunk.content
              : Array.isArray(chunk.content)
              ? chunk.content
                  .filter(
                    (c): c is { type: "text"; text: string } =>
                      typeof c === "object" && "text" in c
                  )
                  .map((c) => c.text)
                  .join("")
              : "";
          if (text) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
            );
          }
          const usage = (
            chunk as {
              usage_metadata?: {
                input_tokens?: number;
                output_tokens?: number;
              };
            }
          ).usage_metadata;
          if (usage) {
            if (usage.input_tokens) promptTokens = usage.input_tokens;
            if (usage.output_tokens) completionTokens = usage.output_tokens;
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ text: `\n\n⚠ ${msg}` })}\n\n`
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
        if (promptTokens > 0 || completionTokens > 0) {
          void logLLMCall({
            bookId: book.id,
            stageRole: persona.stageRole,
            provider: modelSpec.provider,
            model: modelSpec.model,
            promptTokens,
            completionTokens,
            durationMs: Date.now() - startMs,
          }).catch(() => {});
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
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
