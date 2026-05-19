import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAgentForStage } from "@/lib/ui/agent-personas";
import { getModelForRole, resolveModelSpec } from "@/lib/llm/routing";
import { parseModelSpec } from "@/lib/llm/providers";
import { logLLMCall } from "@/lib/llm/call-log";
import { searchWeb } from "@/lib/web-access";
import {
  type ChatMessage,
  extractChapterTopics,
  extractUserQueryFocus,
  buildResearchQueries,
  fetchTopPageTexts,
  formatSearchResults,
  loadPriorContext,
  buildStaticStream,
} from "../_research-helpers";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const book = await db.book.findUnique({
    where: { slug },
    select: { id: true, titleWorking: true, subtitle: true, workflowType: true, metadataJson: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const body = (await req.json()) as { messages: ChatMessage[]; chapterContext?: string };
  const { messages, chapterContext } = body;
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  const stageKey = "RESEARCH" as const;
  const persona = getAgentForStage(stageKey);
  const model = await getModelForRole(persona.stageRole);

  if (!model) {
    return new Response(
      buildStaticStream("I need ANTHROPIC_API_KEY configured to run research. Check your .env file."),
      { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
    );
  }

  const { priorContext, outlineText, sourceDocContext } = await loadPriorContext(
    book.id, book.workflowType, stageKey
  );

  const meta = book.metadataJson && typeof book.metadataJson === "object"
    ? (book.metadataJson as Record<string, string>) : {};
  const bookSubject = [meta.premise, book.titleWorking].filter(Boolean).join(" ").slice(0, 80);

  const topics = extractChapterTopics(outlineText, book.titleWorking ?? "book");
  const userFocus = extractUserQueryFocus(messages);
  const queries = buildResearchQueries(topics, userFocus, bookSubject);

  let searchContext = "";
  try {
    const { results, attempts } = await searchWeb(queries, { perQueryLimit: 5, totalLimit: 15 });
    const pageTexts = await fetchTopPageTexts(results, 3, 3000);
    searchContext = formatSearchResults(results, attempts, "WEB RESEARCH RESULTS", pageTexts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    searchContext = `\n\nWEB RESEARCH: Search error (${msg}). Use training knowledge and flag unverified claims.`;
  }

  const briefLines = [
    meta.premise ? `- Premise: ${meta.premise}` : "",
    meta.targetReader ? `- Target Reader: ${meta.targetReader}` : "",
    meta.promise ? `- Core Promise: ${meta.promise}` : "",
  ].filter(Boolean).join("\n");

  const systemContent = `${persona.systemPrompt}

Book context:
- Title: ${book.titleWorking ?? "(untitled)"}${book.subtitle ? `\n- Subtitle: ${book.subtitle}` : ""}
${briefLines ? briefLines + "\n" : ""}- You are speaking with the author about Stage: research${chapterContext ? `\n- Current chapter: ${chapterContext}` : ""}

Always stay in character as ${persona.name}. Be concise. End your response with a question or a clear next step.

PROSE VOICE RULES:
- No em-dashes (—). Use a comma, colon, semicolon, or period instead.
- Banned words: "delve", "dive into", "unpack", "explore", "it's important to note", "moreover", "furthermore", "in conclusion", "to summarize", "stands as a testament", "in the realm of", "at its core", "leverage", "utilize", "seamlessly", "robust", "foster", "underscore", "navigate", "game-changing", "groundbreaking".
- Vary sentence length. Prefer active voice. Write like a smart human who has edited their own work.

RESEARCH AGENT RULES:
- Every statistic MUST come from the web research results below or verified training knowledge. Label which.
- Format citations inline: (Source: [Title], [URL])
- If you cannot verify a claim, say "Unverified — check before using" rather than stating it as fact.
- When drafting the Research Pack artifact, organize by chapter with 3-5 verified findings per chapter and source citations.

ARTIFACT PRODUCTION:
When asked to "draft the artifact" or "produce the artifact for this stage":

<ARTIFACT>
{"type":"RESEARCH","title":"Research Pack","content":"..."}
</ARTIFACT>

The "content" field: a comprehensive Research Pack organized by chapter, each with 3-5 key facts/statistics/findings and cited sources.${priorContext}${sourceDocContext}${searchContext}`;

  const { HumanMessage, SystemMessage, AIMessage } = await import("@langchain/core/messages");
  const langchainMessages = [
    new SystemMessage(systemContent),
    ...messages.map((m) => m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content)),
  ];

  const encoder = new TextEncoder();
  const modelSpec = parseModelSpec(resolveModelSpec(persona.stageRole));
  const startMs = Date.now();

  const readable = new ReadableStream({
    async start(controller) {
      let promptTokens = 0;
      let completionTokens = 0;

      if (queries.length > 0) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ text: `*Searched: ${queries.map((q) => `"${q}"`).join(", ")}*\n\n` })}\n\n`)
        );
      }

      try {
        const stream = await model.stream(langchainMessages);
        for await (const chunk of stream) {
          const text = typeof chunk.content === "string" ? chunk.content
            : Array.isArray(chunk.content)
              ? chunk.content.filter((c): c is { type: "text"; text: string } => typeof c === "object" && "text" in c).map((c) => c.text).join("")
              : "";
          if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          const usage = (chunk as { usage_metadata?: { input_tokens?: number; output_tokens?: number } }).usage_metadata;
          if (usage) {
            if (usage.input_tokens) promptTokens = usage.input_tokens;
            if (usage.output_tokens) completionTokens = usage.output_tokens;
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream error";
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: `\n\n⚠ ${msg}` })}\n\n`));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
        if (promptTokens > 0 || completionTokens > 0) {
          void logLLMCall({ bookId: book.id, stageRole: persona.stageRole, provider: modelSpec.provider, model: modelSpec.model, promptTokens, completionTokens, durationMs: Date.now() - startMs }).catch(() => {});
        }
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
