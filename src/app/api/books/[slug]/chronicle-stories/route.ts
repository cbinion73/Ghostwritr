import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAgentForStage } from "@/lib/ui/agent-personas";
import { getCommittedBookSetup } from "@/lib/repositories/book-setup-artifacts";
import { normalizeBookSetupProfile } from "@/lib/book-setup-types";
import { resolveResearchLens } from "@/lib/research-lenses";
import { getModelForRole, resolveModelSpec } from "@/lib/llm/routing";
import { parseModelSpec } from "@/lib/llm/providers";
import { logLLMCall } from "@/lib/llm/call-log";
import { searchWeb } from "@/lib/web-access";
import {
  type ChatMessage,
  extractChapterTopics,
  extractUserQueryFocus,
  buildStoryQueries,
  fetchTopPageTexts,
  formatSearchResults,
  loadPriorContext,
  loadChapterFocusedContext,
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

  const body = (await req.json()) as {
    messages: ChatMessage[];
    chapterContext?: string;
    // Single-chapter auto-loop mode
    chapterKey?: string;
    chapterTitle?: string;
  };
  const { messages, chapterContext, chapterTitle } = body;
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing messages" }, { status: 400 });
  }

  const stageKey = "EXTERNAL_STORIES" as const;
  const persona = getAgentForStage(stageKey);
  const model = await getModelForRole(persona.stageRole);

  if (!model) {
    return new Response(
      buildStaticStream("I need ANTHROPIC_API_KEY configured to source stories. Check your .env file."),
      { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } }
    );
  }

  const meta = book.metadataJson && typeof book.metadataJson === "object"
    ? (book.metadataJson as Record<string, string>) : {};
  const bookSubject = [meta.premise, book.titleWorking].filter(Boolean).join(" ").slice(0, 80);

  // Auto-loop (single chapter): use lean focused context — outline section only, no full prior stages
  // Conversation mode: load all prior committed stages as context
  let priorContext = "";
  let outlineText = "";
  let sourceDocContext = "";

  if (chapterTitle) {
    const focused = await loadChapterFocusedContext(book.id, chapterTitle);
    outlineText = focused.chapterOutlineSection;
    sourceDocContext = focused.sourceDocContext;
    if (focused.chapterOutlineSection) {
      priorContext = `\n\nOUTLINE SECTION FOR THIS CHAPTER:\n${focused.chapterOutlineSection}`;
    }
  } else {
    ({ priorContext, outlineText, sourceDocContext } = await loadPriorContext(
      book.id, book.workflowType, stageKey
    ));
  }

  // Per-book research lens (from Book Setup) adds genre-specific story
  // sourcing rules — e.g. Biblical/Theological favors testimonies and
  // documented church-history figures over business cases.
  const committedSetup = await getCommittedBookSetup(book.id);
  const setupProfile = normalizeBookSetupProfile(committedSetup?.contentJson);
  const baseLens = resolveResearchLens(setupProfile?.researchLens);
  const lens =
    baseLens.key === "biblical" && setupProfile?.preferredBibleTranslation
      ? {
          ...baseLens,
          storyGuidance: `${baseLens.storyGuidance}\n\nTRANSLATION PREFERENCE: Quote scripture in the ${setupProfile.preferredBibleTranslation} translation unless a specific source only provides another translation.`,
        }
      : baseLens;

  // Single-chapter mode: focus all searches on the specified chapter
  const topics = chapterTitle
    ? [chapterTitle]
    : extractChapterTopics(outlineText, book.titleWorking ?? "book");
  const userFocus = chapterTitle ? null : extractUserQueryFocus(messages);
  const queries = buildStoryQueries(topics, userFocus, bookSubject);

  let searchContext = "";
  try {
    const { results, attempts } = await searchWeb(queries, { perQueryLimit: 5, totalLimit: 20 });
    const pageTexts = await fetchTopPageTexts(results, 6, 4000);
    searchContext = formatSearchResults(results, attempts, "WEB STORY SOURCES", pageTexts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Search failed";
    searchContext = `\n\nWEB STORY SOURCES: Search error (${msg}). Draw on training knowledge and flag any stories you cannot independently verify.`;
  }

  const briefLines = [
    meta.premise ? `- Premise: ${meta.premise}` : "",
    meta.targetReader ? `- Target Reader: ${meta.targetReader}` : "",
    meta.promise ? `- Core Promise: ${meta.promise}` : "",
  ].filter(Boolean).join("\n");

  const chapterFocusLine = chapterTitle
    ? `\n- CURRENT CHAPTER: "${chapterTitle}" — produce the complete 10-section Chronicle Dossier for THIS chapter only.`
    : chapterContext ? `\n- Current chapter: ${chapterContext}` : "";

  const systemContent = `${persona.systemPrompt}

Book context:
- Title: ${book.titleWorking ?? "(untitled)"}${book.subtitle ? `\n- Subtitle: ${book.subtitle}` : ""}
${briefLines ? briefLines + "\n" : ""}- Stage: external stories${chapterFocusLine}

${chapterTitle
    ? `AUTO-LOOP MODE: You are being called automatically to research stories for one chapter at a time. Produce the complete 10-section Chronicle Dossier for "${chapterTitle}" and wrap it in an ARTIFACT block immediately. Do not ask for confirmation or suggest next steps — just produce the dossier.`
    : `CONVERSATION MODE: Work chapter by chapter. When the author asks about a chapter, produce the full 10-section Chronicle Dossier for that chapter. When asked to compile, wrap all dossiers into a single ARTIFACT block.`}

VERIFICATION FORMAT:
- Stories drawn from web sources: cite as (Source: [Title], [URL], Tier [N])
- Stories from training knowledge: label as (Training knowledge — verify before publishing)
- Unverifiable stories: label as "Unverified — do not use without independent confirmation"
- Prefer Tier 1 and Tier 2 sources. Tier 3 for color only.
${lens.storyGuidance ? `\n${lens.storyGuidance}\n` : ""}

ARTIFACT PRODUCTION:
<ARTIFACT>
{"type":"EXTERNAL_STORIES","title":"${chapterTitle ? `Chronicle Dossier: ${chapterTitle}` : `Chronicle Dossier — ${book.titleWorking ?? "Book"}`}","content":"[full 10-section dossier]"}
</ARTIFACT>

The web story sources below are pre-labelled with quality tiers. Prefer attributable, publicly verifiable stories.${priorContext}${sourceDocContext}${searchContext}`;

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
          encoder.encode(`data: ${JSON.stringify({ text: `*Searching for stories: ${queries.map((q) => `"${q}"`).join(", ")}*\n\n` })}\n\n`)
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
          void logLLMCall({ bookId: book.id, bookSlug: slug, bookTitle: book.titleWorking ?? undefined, stageKey: "EXTERNAL_STORIES", stageRole: persona.stageRole, provider: modelSpec.provider, model: modelSpec.model, promptTokens, completionTokens, durationMs: Date.now() - startMs }).catch(() => {});
        }
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
