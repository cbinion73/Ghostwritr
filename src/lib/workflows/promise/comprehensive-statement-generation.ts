import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { BookSetupProfile } from "../../book-setup-types";
import { getModelForRole } from "../../llm/routing";
import { getBookKnowledgeBase } from "../../services/knowledge-base";
import { ensurePromiseEnvLoaded } from "./generation-models";
import { formatSetupContextForPrompt } from "./generation-context";

async function getChatModel(
  overrides: {
    temperature?: number;
    maxOutputTokens?: number;
    timeoutMs?: number;
    maxRetries?: number;
  } = {},
) {
  ensurePromiseEnvLoaded();
  return getModelForRole("promise:author", {
    temperature: overrides.temperature ?? 0.25,
    maxOutputTokens: overrides.maxOutputTokens ?? 4000,
    timeoutMs: overrides.timeoutMs ?? 90000,
    maxRetries: overrides.maxRetries ?? 2,
  });
}

export async function generateComprehensivePromiseStatement(
  bookSetupProfile: BookSetupProfile | null,
  bookId?: string,
): Promise<string> {
  try {
    console.log("[generateComprehensivePromiseStatement] Starting...");
    const model = await getChatModel();

    if (!model) {
      console.log("[generateComprehensivePromiseStatement] No model, using fallback");
      return "This book provides readers with actionable insights and practical frameworks to achieve their goals.";
    }

    const setupContext = bookSetupProfile ? formatSetupContextForPrompt(bookSetupProfile) : "";

    let knowledgeContext = "";
    if (bookId) {
      try {
        console.log("[generateComprehensivePromiseStatement] Loading full knowledge base...");
        const knowledgeBase = await getBookKnowledgeBase(bookId, 200000);

        if (knowledgeBase.content && knowledgeBase.sourceCount > 0) {
          knowledgeContext =
            "\n\n=== BOOK REFERENCE MATERIALS ===\n" +
            `(${knowledgeBase.sourceCount} source documents)\n\n` +
            knowledgeBase.content;
          console.log(
            `[generateComprehensivePromiseStatement] Loaded ${knowledgeBase.sourceCount} documents, ${knowledgeBase.content.length} characters`,
          );
        } else {
          console.log("[generateComprehensivePromiseStatement] No knowledge base content found");
        }
      } catch (err) {
        console.warn(
          "[generateComprehensivePromiseStatement] Failed to load knowledge base:",
          err,
        );
      }
    } else {
      console.log("[generateComprehensivePromiseStatement] No bookId provided, skipping knowledge base");
    }

    const systemPrompt = `You are an expert book strategist creating a comprehensive, multi-dimensional promise statement.

CRITICAL INSTRUCTIONS:
- You MUST include ALL 7 sections listed below
- Each section should be substantial (3-5 sentences minimum for most sections)
- Do NOT summarize or condense
- Do NOT skip any sections
- Include clear headers for each section

Generate a DETAILED promise statement with these REQUIRED 7 sections:

1. **The Promise (Short Form)**: What the book fundamentally promises to deliver. Be specific about what readers will gain, not generic claims. (2-3 sentences)

2. **The Transformation**: Describe the complete before/after journey. Detail what the reader's situation, challenges, and mindset are BEFORE reading. Then describe how they will be different AFTER reading the book.

3. **The Mechanism**: What system, framework, or approach enables this transformation? Name it specifically. Explain the core principles and how they work to create change.

4. **The Practical Outcomes**: List 5-7 specific, measurable, actionable results the reader will achieve. Be concrete. Examples: skills gained, problems solved, capabilities developed.

5. **The Emotional Outcome**: How will the reader FEEL differently after reading? What emotional transformation occurs? What confidence, clarity, or peace of mind do they gain?

6. **What This Book IS NOT**: Clarify what the book explicitly does NOT promise or cover. What misunderstandings should be corrected? What is out of scope?

7. **The Closing Statement**: A final, powerful 2-3 sentence summary that ties everything together and inspires action.

FORMATTING: Use the exact section headers above. Make this comprehensive and substantial—aim for 800-1200 words total.

Book Voice Context:
${setupContext}${knowledgeContext}

NOW GENERATE THE FULL COMPREHENSIVE PROMISE STATEMENT:`;

    const result = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage("Generate the comprehensive promise statement now."),
    ]);

    const promiseText = typeof result.content === "string" ? result.content : String(result.content);
    console.log(`[generateComprehensivePromiseStatement] Result obtained, length: ${promiseText.length}`);
    return promiseText;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[generateComprehensivePromiseStatement] Error:", errorMsg);
    throw error;
  }
}
