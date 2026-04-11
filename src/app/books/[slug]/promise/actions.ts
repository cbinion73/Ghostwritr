"use server";

import { revalidatePath } from "next/cache";
import { ActorType, ArtifactType, StageKey } from "@prisma/client";

import { getOrCreateBookBySlug } from "@/lib/repositories/books";
import { createDirectionEvent } from "@/lib/repositories/direction-events";
import {
  setSourceDocumentEnabled,
} from "@/lib/repositories/source-documents";
import { createPromiseArtifactVersion } from "@/lib/repositories/promise-artifacts";
import { commitPromiseWorkflow, runPromiseWorkflow } from "@/lib/workflows/promise";
import { getPromiseWorkspace } from "@/lib/workflows/promise";
import { markWorkflowRunning, markWorkflowComplete } from "@/lib/workflow-status";
import {
  createValidationScores,
  type ValidationScores,
} from "@/lib/validation/promise-validator";
import {
  performGeminiMarketResearch,
  validatePromiseStrengthWithGemini,
} from "@/lib/validation/gemini-market-research";
import {
  autoGeneratePersonas,
  autoOptimizeMarketAnalysis,
  autoImprovePromise,
} from "@/lib/validation/auto-optimize";
import {
  refinePromiseSimple,
  generatePersonasSimple,
  optimizeMarketSimple,
} from "@/lib/validation/simple-refinement";

export async function submitPromiseMessage(slug: string, formData: FormData) {
  const message = String(formData.get("message") ?? "").trim();

  if (!message) {
    return;
  }

  const book = await getOrCreateBookBySlug(slug);
  markWorkflowRunning(book.id);

  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_USER_DIRECTION",
    title: "User directed the promise stage",
    content: message,
  });

  // Run workflow asynchronously to avoid timeout
  runPromiseWorkflow(slug, message)
    .catch((error) => {
      console.error("[submitPromiseMessage] Workflow failed:", error);
    })
    .finally(() => {
      markWorkflowComplete(book.id);
      revalidatePath(`/books/${slug}/promise`);
    });
}

export async function seedPromiseWorkspace(slug: string) {
  const book = await getOrCreateBookBySlug(slug);
  const sampleDirection =
    "I want to write a professional nonfiction book that helps a clearly defined audience solve a costly recurring problem through a practical, memorable framework. I want the promise to feel concrete, useful, and commercially strong.";
  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_SAMPLE_SEEDED",
    title: "Seeded sample promise direction",
    content: sampleDirection,
  });
  await runPromiseWorkflow(slug, sampleDirection);
  revalidatePath(`/books/${slug}/promise`);
}

export async function commitPromiseStage(slug: string) {
  await commitPromiseWorkflow(slug);
  revalidatePath(`/books/${slug}/promise`);
}

export async function togglePromiseReferenceMaterial(
  slug: string,
  documentId: string,
  enabled: boolean,
) {
  const book = await getOrCreateBookBySlug(slug);

  await setSourceDocumentEnabled({
    documentId,
    enabled,
  });

  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: enabled ? "PROMISE_REFERENCE_ENABLED" : "PROMISE_REFERENCE_DISABLED",
    title: enabled ? "Enabled promise reference material" : "Disabled promise reference material",
    metadataJson: {
      documentId,
      enabled,
    },
  });

  revalidatePath(`/books/${slug}/promise`);
  revalidatePath(`/books/${slug}/files`);
}

export async function saveFinalPromiseStatement(slug: string, formData: FormData) {
  const promiseStatement = String(formData.get("promiseStatement") ?? "").trim();

  if (!promiseStatement) {
    return;
  }

  const book = await getOrCreateBookBySlug(slug);
  const workspace = await getPromiseWorkspace(slug);
  const nextPromiseBrief = {
    ...workspace.promiseBrief,
    promiseStatement,
  };

  await createPromiseArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PROMISE_BRIEF,
    title: "Promise Brief",
    summary: promiseStatement,
    contentJson: nextPromiseBrief,
    contentText: promiseStatement,
    createdByType: ActorType.USER,
  });

  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_BRIEF_EDITED",
    title: "Edited final book promise",
    content: promiseStatement,
    metadataJson: {
      referenceMaterialCount: workspace.sourceDocuments.filter((doc) => doc.enabled).length,
    },
  });

  revalidatePath(`/books/${slug}/promise`);
}

export async function savePromiseStatement(slug: string, statement: string) {
  "use server";

  if (!statement.trim()) {
    return;
  }

  const book = await getOrCreateBookBySlug(slug);
  const workspace = await getPromiseWorkspace(slug);
  const nextPromiseBrief = {
    ...workspace.promiseBrief,
    promiseStatement: statement,
  };

  await createPromiseArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PROMISE_BRIEF,
    title: "Promise Brief",
    summary: statement,
    contentJson: nextPromiseBrief,
    contentText: statement,
    createdByType: ActorType.USER,
  });

  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_BRIEF_EDITED",
    title: "Edited final book promise",
    content: statement,
    metadataJson: {
      referenceMaterialCount: workspace.sourceDocuments.filter((doc) => doc.enabled).length,
    },
  });

  revalidatePath(`/books/${slug}/promise`);
}

export async function refinePomiseWithAI(
  slug: string,
  currentPromise: string,
  validationGaps: string[]
): Promise<string> {
  "use server";

  try {
    console.log("[refinePomiseWithAI] Starting refinement with direct API...");

    // Clean up gaps for better prompting
    const cleanedGaps = validationGaps
      .map((gap) => gap.replace(/^[✓✗⚠]\s*/, "").trim())
      .filter((gap) => gap.length > 0 && gap !== "—")
      .slice(0, 8);

    console.log("[refinePomiseWithAI] Cleaned gaps:", cleanedGaps);

    const gapsText =
      cleanedGaps.length > 0
        ? cleanedGaps.join("\n- ")
        : "General improvement and optimization";

    const improvedPromise = await refinePromiseSimple(currentPromise, cleanedGaps);

    console.log("[refinePomiseWithAI] Refined promise received");
    return improvedPromise.trim();
  } catch (error) {
    console.error("[refinePomiseWithAI] Error details:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Return original promise as fallback instead of throwing
    console.warn("[refinePomiseWithAI] Returning original promise as fallback");
    return currentPromise;
  }
}

export async function generatePromiseTemplate(slug: string) {
  "use server";

  const template = `1. The Promise (Short Form)

This book does not promise that the reader will become a naturally gifted leader.
It promises the reader will gain the practical leadership skills required to move a lab from expertise-driven management to team-centered execution.

⸻

2. The Transformation

From:

A lab professional (PI, senior scientist, lab manager) who is:

	•	"Drowning in expertise but isolated by it"
	•	"Managing by problem-solving rather than delegation"
	•	"Stuck choosing between being the expert or the leader"

To:

A lab professional who:

	•	"Leads with confidence without losing credibility"
	•	"Moves problems through the team instead of through themselves"
	•	"Builds trust that accelerates execution"

⸻

3. The Mechanism (How It Happens)

This transformation is made possible through:
The LabFlow Leadership System

Description:

A practical, data-informed system that:

	•	Filters organizational noise to isolate what actually matters
	•	Prioritizes trust-building and delegation over technical perfection
	•	Translates insight into repeatable leadership actions

⸻

4. The Practical Outcomes

After reading this book, the reader will be able to:
	•	Recognize the exact moment they're leading by expertise instead of by authority
	•	Design meetings and processes that replace dependency with capability
	•	Build team members who can operate without constant oversight
	•	Measure and course-correct team dynamics in real time

⸻

5. The Emotional Outcome

Instead of feeling:

	•	"I'm the only one who can do this right"
	•	"If I step back, things fall apart"

The reader will experience:

	•	"My team is stronger than I am"
	•	"The lab moves faster when I'm not in the way"

⸻

6. What This Book Is NOT

This is not a book about:

	•	"Becoming a friendly manager who ignores performance"
	•	"Soft skills, emotional intelligence, or personality theory"

This is a book about:

	•	"Building operational clarity"
	•	"Creating systems that prevent failure"
	•	"Leading like a lab actually works"

⸻

7. The Closing Statement

This book is a guide to moving leadership from inside your expertise to outside it.
Not by becoming less competent,
but by making your team competent enough that you don't have to be everywhere.`;

  await savePromiseStatement(slug, template);
}

export async function autoGeneratePersonasAction(slug: string) {
  "use server";

  try {
    console.log("[autoGeneratePersonasAction] Starting persona generation with direct API...");
    const workspace = await getPromiseWorkspace(slug);
    const personas = await generatePersonasSimple(workspace.promiseBrief.promiseStatement || "");

    // Save personas to artifact
    console.log("[autoGeneratePersonasAction] Saving personas to artifact...");
    console.log("[autoGeneratePersonasAction] Personas data structure:", JSON.stringify(personas, null, 2).substring(0, 1000));

    await createPromiseArtifactVersion({
      bookId: workspace.book.id,
      artifactType: ArtifactType.PERSONA_PACK,
      title: "Persona Pack",
      summary: "Auto-generated reader personas from book promise.",
      contentJson: personas,
    });

    console.log("[autoGeneratePersonasAction] Personas saved successfully");
    revalidatePath(`/books/${slug}/promise`);
    return personas;
  } catch (error) {
    console.error("[autoGeneratePersonasAction] Error:", error);
    throw error;
  }
}

export async function autoOptimizeMarketAction(slug: string) {
  "use server";

  try {
    console.log("[autoOptimizeMarketAction] Starting market optimization with direct API...");
    const workspace = await getPromiseWorkspace(slug);
    const marketReport = await optimizeMarketSimple(
      workspace.promiseBrief.promiseStatement || "",
      workspace.promiseBrief.audiencePrimary || ""
    );

    // Save market report to artifact
    console.log("[autoOptimizeMarketAction] Saving market report to artifact...");
    await createPromiseArtifactVersion({
      bookId: workspace.book.id,
      artifactType: ArtifactType.MARKET_REPORT,
      title: "Market Report",
      summary: "Auto-optimized market analysis for book positioning.",
      contentJson: marketReport,
    });

    console.log("[autoOptimizeMarketAction] Market report saved successfully");
    revalidatePath(`/books/${slug}/promise`);
    return marketReport;
  } catch (error) {
    console.error("[autoOptimizeMarketAction] Error:", error);
    throw error;
  }
}

export async function autoImprovePromiseAction(slug: string) {
  "use server";

  try {
    const workspace = await getPromiseWorkspace(slug);
    const improved = await autoImprovePromise(
      workspace.promiseBrief.promiseStatement || "",
      workspace.promiseBrief.audiencePrimary || "",
      workspace.promiseBrief.coreTruth || ""
    );

    // Optionally save
    console.log("[autoImprovePromiseAction] Improved promise:", improved);

    return improved;
  } catch (error) {
    console.error("[autoImprovePromiseAction] Error:", error);
    throw error;
  }
}

export async function validatePromise(
  slug: string
): Promise<ValidationScores> {
  "use server";

  const workspace = await getPromiseWorkspace(slug);

  // Use Gemini to perform grounded market research
  const geminiMarketResearch = await performGeminiMarketResearch(
    workspace.promiseBrief.promiseStatement || "",
    workspace.promiseBrief.audiencePrimary || "",
    "Professional development and leadership"
  );

  // Transform Gemini research into scoring format
  const marketResearch = {
    marketSize: geminiMarketResearch.marketSize,
    trends: geminiMarketResearch.marketGrowthSignals,
    comparableBooks: geminiMarketResearch.comparableBooks.map((b) => b.title),
  };

  // Calculate validation scores
  const scores = createValidationScores(
    workspace.promiseBrief,
    workspace.personas,
    workspace.market,
    marketResearch
  );

  return scores;
}

