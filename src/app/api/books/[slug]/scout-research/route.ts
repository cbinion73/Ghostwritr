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
  buildClaimBasedQueries,
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
  const queries = buildClaimBasedQueries(topics, userFocus, bookSubject);

  let searchContext = "";
  try {
    const { results, attempts } = await searchWeb(queries, { perQueryLimit: 5, totalLimit: 20 });
    const pageTexts = await fetchTopPageTexts(results, 6, 4000);
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
${briefLines ? briefLines + "\n" : ""}- Stage: research${chapterContext ? `\n- Current chapter focus: ${chapterContext}` : ""}

CONVERSATION MODE:
Work chapter by chapter. When the author asks you to research a chapter, produce the full 10-section Chapter Research Dossier for that chapter inline in the chat. When the author says "compile the dossier" or "save the dossier" or "produce the artifact", wrap ALL chapter dossiers you have produced into a single ARTIFACT block.

CITATION FORMAT:
- Cite inline as: (Source: [Title], [URL], Tier [N])
- If a claim comes from training knowledge and not the web results, label it: (Training knowledge — verify before publishing)
- Mark unverifiable claims: "Unverified — check before using"
- Use Tier 1 and Tier 2 sources for core claims. Tier 3 for color only.

ARTIFACT PRODUCTION — when compiling the full dossier:
<ARTIFACT>
{"type":"RESEARCH","title":"Research Dossier — ${book.titleWorking ?? "Book"}","content":"[all chapter dossiers in 10-section format, one after another]"}
</ARTIFACT>

The web research results below are pre-labelled with source tiers. Prefer Tier 1 and Tier 2 sources for core claims.${priorContext}${sourceDocContext}${searchContext}`;

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
        const queryList = queries.map((q) => `"${q}"`).join(", ");
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ text: `*Running ${queries.length} targeted queries across evidence, data, frameworks, and counterpoints: ${queryList}*\n\n` })}\n\n`)
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
