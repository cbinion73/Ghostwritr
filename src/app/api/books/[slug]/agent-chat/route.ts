import { NextResponse } from "next/server";
import type { StageKey } from "@prisma/client";
import { db } from "@/lib/db";
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

  const body = await req.json() as { stageKey: StageKey; messages: ChatMessage[]; chapterContext?: string };
  const { stageKey, messages, chapterContext } = body;

  if (!stageKey || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing stageKey or messages" }, { status: 400 });
  }

  const persona = getAgentForStage(stageKey);
  const model = await getModelForRole(persona.stageRole);

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
  const stageOrder = getWorkflowStageKeys(book.workflowType);
  const currentIdx = stageOrder.indexOf(stageKey);
  const priorKeys = currentIdx > 0 ? stageOrder.slice(0, currentIdx) : [];

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

  // ── Also pull source documents (brainstorm uploads) ───────────────────────
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
      sourceDocContext = `\n\nAUTHOR SOURCE DOCUMENTS (uploaded during brainstorm — treat as raw material):\n\n${docSections.join("\n\n")}`;
    }
  }

  // Extract brief metadata written at book creation time
  const meta = book.metadataJson && typeof book.metadataJson === "object" ? book.metadataJson as Record<string, string> : {};
  const briefLines = [
    meta.premise ? `- Premise: ${meta.premise}` : "",
    meta.targetReader ? `- Target Reader: ${meta.targetReader}` : "",
    meta.promise ? `- Core Promise: ${meta.promise}` : "",
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

The "content" field should be the full artifact text (can be multi-paragraph prose, JSON, or structured markdown). Keep the ARTIFACT block at the end of your response.${priorContext}${sourceDocContext}`;

  const { HumanMessage, SystemMessage, AIMessage } = await import("@langchain/core/messages");

  const langchainMessages = [
    new SystemMessage(systemContent),
    ...messages.map((m) =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
  ];

  const encoder = new TextEncoder();

  const modelSpec = parseModelSpec(resolveModelSpec(persona.stageRole));
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
            bookId: book.id,
            stageRole: persona.stageRole,
            provider: modelSpec.provider,
            model: modelSpec.model,
            promptTokens,
            completionTokens,
            durationMs: Date.now() - startMs,
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
