"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ActorType, ArtifactType, StageKey, StageStatus } from "@prisma/client";

import {
  getOrCreateBookBySlug,
  updateBookTitleMetadata,
  updateStageForBook,
} from "@/lib/repositories/books";
import { createDirectionEvent } from "@/lib/repositories/direction-events";
import {
  setSourceDocumentEnabled,
} from "@/lib/repositories/source-documents";
import { createPromiseArtifactVersion } from "@/lib/repositories/promise-artifacts";
import {
  commitPromiseWorkflow,
  runPromiseWorkflow,
  getPromiseWorkspace,
  maybeGenerateAudienceResearchPhase1,
  maybeGeneratePersonasDeepProfile,
  maybeGeneratePersonaComparisonAnalysis,
  maybeGenerateCoreTruths,
  maybeGenerateTransformationArc,
  maybeGenerateMarketReport,
  maybeGenerateRecommendations,
  maybeGenerateTitleSubtitleFinalization,
  maybeGenerateBookPromiseReport,
  composeBookPromiseReportFromMarkdown,
  generateComprehensivePromiseStatement,
} from "@/lib/workflows/promise-public";
import { resolveModelSpec } from "@/lib/llm/routing";
import { markWorkflowRunning, markWorkflowComplete } from "@/lib/workflow-status";
import {
  createValidationScores,
  type ValidationScores,
} from "@/lib/validation/promise-validator";
import type {
  AudienceResearchArtifact,
  AudienceResearchPhase1,
  BookPromiseReport,
  PersonaDeepProfile,
  PersonaComparisonAnalysis,
  CoreTruthsArtifact,
  MarketReport,
  PositioningRecommendations,
  PromisePhaseApprovals,
  PromiseTabName,
  TitleSubtitleFinalization,
  TransformationArtifact,
} from "@/lib/promise-types";
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

const PROMISE_TAB_ORDER: PromiseTabName[] = [
  "promise-statement",
  "audience",
  "truth",
  "transformation",
  "market",
  "recommendations",
  "book-promise",
];

function getDefaultPromisePhaseApprovals(): PromisePhaseApprovals {
  return Object.fromEntries(
    PROMISE_TAB_ORDER.map((tab) => [tab, { status: "pending" as const }]),
  ) as PromisePhaseApprovals;
}

function mergePromisePhaseApprovals(
  current: PromisePhaseApprovals | undefined,
  phaseId: PromiseTabName,
  nextRecord: PromisePhaseApprovals[PromiseTabName],
): PromisePhaseApprovals {
  return {
    ...getDefaultPromisePhaseApprovals(),
    ...(current ?? {}),
    [phaseId]: nextRecord,
  };
}

function sanitizeTitleSubtitleFinalization(
  input: TitleSubtitleFinalization,
  fallback?: TitleSubtitleFinalization,
): TitleSubtitleFinalization {
  const finalizedTitle = input.finalizedTitle.trim();
  const finalizedSubtitle = input.finalizedSubtitle.trim();

  if (!finalizedTitle) {
    throw new Error("Final title cannot be empty.");
  }

  if (!finalizedSubtitle) {
    throw new Error("Final subtitle cannot be empty.");
  }

  const alternatives = (input.alternatives ?? [])
    .map((alternative) => ({
      title: alternative.title.trim(),
      subtitle: alternative.subtitle.trim(),
      whyItCouldWork: alternative.whyItCouldWork.trim(),
    }))
    .filter((alternative) => alternative.title && alternative.subtitle && alternative.whyItCouldWork)
    .slice(0, 4);

  return {
    finalizedTitle,
    finalizedSubtitle,
    positioningHook: input.positioningHook.trim() || fallback?.positioningHook || "",
    titleRationale: input.titleRationale.trim() || fallback?.titleRationale || "",
    subtitleRationale: input.subtitleRationale.trim() || fallback?.subtitleRationale || "",
    audienceFit: input.audienceFit.trim() || fallback?.audienceFit || "",
    marketFit: input.marketFit.trim() || fallback?.marketFit || "",
    alternatives,
    metadata: {
      ...(fallback?.metadata ?? {}),
      ...(input.metadata ?? {}),
      createdAt:
        input.metadata?.createdAt ||
        fallback?.metadata?.createdAt ||
        new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: input.metadata?.model || fallback?.metadata?.model || "manual-edit",
    },
  };
}

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
      revalidatePath(`/books/${slug}`);
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
  revalidatePath(`/books/${slug}`);
}

export async function commitPromiseStage(slug: string) {
  await commitPromiseWorkflow(slug);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/outline`);
  revalidatePath(`/books/${slug}/dashboard`);
  redirect(`/books/${slug}/outline`);
}

export async function approvePromisePhaseAction(
  slug: string,
  phaseId: PromiseTabName,
): Promise<PromisePhaseApprovals> {
  "use server";

  const book = await getOrCreateBookBySlug(slug);
  const workspace = await getPromiseWorkspace(slug);
  const stageMetadata =
    workspace.stage?.metadataJson && typeof workspace.stage.metadataJson === "object"
      ? workspace.stage.metadataJson
      : {};

  const phaseApprovals = mergePromisePhaseApprovals(
    workspace.phaseApprovals,
    phaseId,
    {
      status: "approved",
      approvedAt: new Date().toISOString(),
    },
  );

  const allApproved = PROMISE_TAB_ORDER.every(
    (tab) => phaseApprovals[tab]?.status === "approved",
  );

  await updateStageForBook(book.id, StageKey.PROMISE, {
    status: allApproved ? StageStatus.READY_FOR_REVIEW : StageStatus.IN_PROGRESS,
    startedAt: workspace.stage?.startedAt ?? new Date(),
    metadataJson: {
      ...stageMetadata,
      phaseApprovals,
    },
  });

  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_PHASE_APPROVED",
    title: `Approved ${phaseId}`,
    content: `${phaseId} was approved in the Promise workflow.`,
    metadataJson: {
      phaseId,
      phaseApprovals,
    },
  });

  revalidatePath(`/books/${slug}`);
  return phaseApprovals;
}

export async function rejectPromisePhaseAction(
  slug: string,
  phaseId: PromiseTabName,
  feedback: string,
): Promise<PromisePhaseApprovals> {
  "use server";

  const book = await getOrCreateBookBySlug(slug);
  const workspace = await getPromiseWorkspace(slug);
  const stageMetadata =
    workspace.stage?.metadataJson && typeof workspace.stage.metadataJson === "object"
      ? workspace.stage.metadataJson
      : {};

  const phaseApprovals = mergePromisePhaseApprovals(
    workspace.phaseApprovals,
    phaseId,
    {
      status: "rejected",
      feedback: feedback.trim(),
      rejectedAt: new Date().toISOString(),
    },
  );

  await updateStageForBook(book.id, StageKey.PROMISE, {
    status: StageStatus.IN_PROGRESS,
    startedAt: workspace.stage?.startedAt ?? new Date(),
    metadataJson: {
      ...stageMetadata,
      phaseApprovals,
    },
  });

  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_PHASE_CHANGES_REQUESTED",
    title: `Requested changes for ${phaseId}`,
    content: feedback.trim() || `${phaseId} needs changes.`,
    metadataJson: {
      phaseId,
      phaseApprovals,
    },
  });

  revalidatePath(`/books/${slug}`);
  return phaseApprovals;
}

export async function togglePromiseReferenceMaterial(
  slug: string,
  documentId: string,
  enabled: boolean,
) {
  const book = await getOrCreateBookBySlug(slug);

  await setSourceDocumentEnabled({
    documentId,
    bookId: book.id,
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

  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/files`);
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
    metadata: {
      ...(workspace.promiseBrief.metadata ?? {}),
      updatedAt: new Date().toISOString(),
      model: "manual-edit",
    },
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
    title: "Edited final book pitch",
    content: statement,
    metadataJson: {
      referenceMaterialCount: workspace.sourceDocuments.filter((doc) => doc.enabled).length,
    },
  });

  revalidatePath(`/books/${slug}`);
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
    revalidatePath(`/books/${slug}`);
    return personas;
  } catch (error) {
    console.error("[autoGeneratePersonasAction] Error:", error);
    throw error;
  }
}

export async function autoOptimizeMarketAction(slug: string) {
  return generateMarketAnalysisAction(slug);
}

export async function generateMarketAnalysisAction(
  slug: string,
): Promise<MarketReport> {
  "use server";

  try {
    console.log("[generateMarketAnalysisAction] Starting grounded Gemini market analysis...");
    const workspace = await getPromiseWorkspace(slug);
    const book = await getOrCreateBookBySlug(slug);

    if (!workspace.promiseBrief) {
      throw new Error("Promise brief not found. Generate promise first.");
    }

    const marketReport = await maybeGenerateMarketReport(
      workspace.promiseBrief,
      workspace.audienceResearch,
      workspace.audienceResearch?.phase2?.personas,
      workspace.personas?.personas,
      workspace.coreTruths,
      workspace.transformationArc,
      workspace.bookSetupProfile,
      book.id,
    );

    console.log("[generateMarketAnalysisAction] Saving market report to artifact...");
    await createPromiseArtifactVersion({
      bookId: book.id,
      artifactType: ArtifactType.MARKET_REPORT,
      title: "Market Report",
      summary:
        marketReport.executiveSummary.headline ||
        "Grounded market analysis for book positioning.",
      contentJson: marketReport,
    });

    console.log("[generateMarketAnalysisAction] Market report saved successfully");
    revalidatePath(`/books/${slug}`);
    return marketReport;
  } catch (error) {
    console.error("[generateMarketAnalysisAction] Error:", error);
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

export async function refinePromiseWithIntelligentAgents(
  slug: string
): Promise<{
  success: boolean;
  iterationCount: number;
  finalScores: ValidationScores;
  stoppedReason: 'target_reached' | 'max_iterations' | 'error';
  errorMessage?: string;
}> {
  "use server";

  try {
    // Placeholder implementation - returns current scores
    const scores = await validatePromise(slug);

    return {
      success: true,
      iterationCount: 0,
      finalScores: scores,
      stoppedReason: 'target_reached',
    };
  } catch (error) {
    return {
      success: false,
      iterationCount: 0,
      finalScores: {} as ValidationScores,
      stoppedReason: 'error',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function refinePromiseToExcellence(
  slug: string
): Promise<{
  success: boolean;
  iterationCount: number;
  refinementLog?: string[];
  errorMessage?: string;
}> {
  "use server";

  const MAX_ITERATIONS = 3;
  const refinementLog: string[] = [];
  let iterationCount = 0;

  try {
    const book = await getOrCreateBookBySlug(slug);
    markWorkflowRunning(book.id);

    refinementLog.push("🚀 Starting automated artifact generation and refinement...");

    const workspace = await getPromiseWorkspace(slug);
    const promiseStatement = workspace.promiseBrief.promiseStatement || "";
    const primaryAudience = workspace.promiseBrief.audiencePrimary || "";

    if (!promiseStatement) {
      throw new Error("No promise statement found. Create a promise first.");
    }

    // Iterative artifact generation
    while (iterationCount < MAX_ITERATIONS) {
      iterationCount++;
      refinementLog.push(`\n🔄 Iteration ${iterationCount}/${MAX_ITERATIONS}`);

      try {
        // Step 1: Generate/refine personas
        refinementLog.push("  → Generating reader personas...");
        const personas = await generatePersonasSimple(promiseStatement);
        await createPromiseArtifactVersion({
          bookId: book.id,
          artifactType: ArtifactType.PERSONA_PACK,
          title: "Persona Pack",
          summary: `Reader personas for book promise (iteration ${iterationCount})`,
          contentJson: personas,
        });
        refinementLog.push("  ✓ Personas generated");

        // Step 2: Generate/optimize market analysis
        refinementLog.push("  → Generating market analysis...");
        const marketReport = await optimizeMarketSimple(promiseStatement, primaryAudience);
        await createPromiseArtifactVersion({
          bookId: book.id,
          artifactType: ArtifactType.MARKET_REPORT,
          title: "Market Report",
          summary: `Market analysis for book positioning (iteration ${iterationCount})`,
          contentJson: marketReport,
        });
        refinementLog.push("  ✓ Market analysis generated");

        // Step 3: Refine promise statement
        if (iterationCount > 1) {
          refinementLog.push("  → Refining promise statement...");
          const improvedPromise = await refinePromiseSimple(
            promiseStatement,
            [`Iteration ${iterationCount} refinement to strengthen clarity and impact`]
          );
          await savePromiseStatement(slug, improvedPromise);
          refinementLog.push("  ✓ Promise statement refined");
        }
      } catch (iterationError) {
        refinementLog.push(
          `  ⚠ Iteration ${iterationCount} error: ${
            iterationError instanceof Error ? iterationError.message : "Unknown error"
          }`
        );
      }
    }

    refinementLog.push(`\n✅ Artifact generation complete after ${iterationCount} iterations`);
    revalidatePath(`/books/${slug}`);

    return {
      success: true,
      iterationCount,
      refinementLog,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    refinementLog.push(`\n❌ Error: ${errorMessage}`);

    return {
      success: false,
      iterationCount,
      refinementLog,
      errorMessage,
    };
  } finally {
    const book = await getOrCreateBookBySlug(slug);
    markWorkflowComplete(book.id);
  }
}

export async function saveValidatedPersonas(slug: string) {
  "use server";

  try {
    const workspace = await getPromiseWorkspace(slug);

    if (!workspace.personas) {
      throw new Error('No personas found in workspace');
    }

    // Save personas to artifact
    await createPromiseArtifactVersion({
      bookId: workspace.book.id,
      artifactType: ArtifactType.PERSONA_PACK,
      title: "Persona Pack",
      summary: "Validated reader personas",
      contentJson: workspace.personas,
    });

    revalidatePath(`/books/${slug}`);

    return { success: true, message: 'Personas saved successfully' };
  } catch (error) {
    console.error('[saveValidatedPersonas] Error:', error);
    throw error;
  }
}

// ============================================
// AUDIENCE RESEARCH SERVER ACTIONS
// ============================================

export async function generateAudienceResearchPhase1Action(
  slug: string
): Promise<AudienceResearchPhase1> {
  "use server";

  try {
    console.log(`[generateAudienceResearchPhase1Action] Starting for slug: ${slug}`);
    const workspace = await getPromiseWorkspace(slug);
    console.log(`[generateAudienceResearchPhase1Action] Workspace loaded, promiseBrief:`, workspace.promiseBrief?.promiseStatement?.substring(0, 100));

    const phase1 = await maybeGenerateAudienceResearchPhase1(
      workspace.promiseBrief,
      workspace.bookSetupProfile
    );
    console.log(`[generateAudienceResearchPhase1Action] Phase 1 generated:`, phase1);

    // Save to artifact
    const book = await getOrCreateBookBySlug(slug);
    console.log(`[generateAudienceResearchPhase1Action] Book loaded: ${book.id}`);

    await createPromiseArtifactVersion({
      bookId: book.id,
      artifactType: ArtifactType.AUDIENCE_RESEARCH,
      title: "Audience Research",
      summary: "Phase 1: Audience Discovery",
      contentJson: {
        phase: 1,
        phase1,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          model: resolveModelSpec("audience:structured"),
        },
      } as AudienceResearchArtifact,
    });
    console.log(`[generateAudienceResearchPhase1Action] Artifact version created`);

    // Don't revalidate - let the client handle the state update
    // revalidatePath(`/books/${slug}/promise`);
    return phase1;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("[generateAudienceResearchPhase1Action] Error:", errorMsg);
    console.error("[generateAudienceResearchPhase1Action] Stack:", errorStack);
    throw error;
  }
}

export async function generatePersonasDeepProfileAction(
  slug: string,
  audienceResearch: AudienceResearchPhase1,
  numPersonas?: number
): Promise<{ personas: PersonaDeepProfile[] }> {
  "use server";

  const { writeFileSync } = await import("fs");
  const logPath = "/tmp/deep-personas-gen.log";
  const log = (msg: string) => {
    console.log(msg);
    try {
      writeFileSync(logPath, msg + "\n", { flag: "a" });
    } catch (e) {
      // Silently fail file logging
    }
  };

  try {
    log("[generatePersonasDeepProfileAction] Starting..., slug=" + slug + ", numPersonas=" + numPersonas);
    const workspace = await getPromiseWorkspace(slug);
    log("[generatePersonasDeepProfileAction] Workspace loaded, hasPromiseBrief=" + !!workspace.promiseBrief + ", bookId=" + workspace.book.id);

    // Use workspace.book.id (UUID) directly
    const bookId = workspace.book.id;

    log("[generatePersonasDeepProfileAction] Calling maybeGeneratePersonasDeepProfile...");
    const phase2 = await maybeGeneratePersonasDeepProfile(
      workspace.promiseBrief,
      audienceResearch,
      workspace.bookSetupProfile,
      bookId,
      numPersonas || 5
    );
    log("[generatePersonasDeepProfileAction] Phase 2 generated, personas count=" + phase2.personas.length);

    log("[generatePersonasDeepProfileAction] Creating artifact...");
    await createPromiseArtifactVersion({
      bookId,
      artifactType: ArtifactType.AUDIENCE_RESEARCH,
      title: "Audience Research",
      summary: "Phase 2: Deep Persona Research",
      contentJson: {
        phase: 2,
        phase1: audienceResearch,
        phase2,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      } as AudienceResearchArtifact,
    });
    log("[generatePersonasDeepProfileAction] Artifact created successfully");

    // Don't revalidate - let the client handle the state update
    // revalidatePath(`/books/${slug}/promise`);
    return phase2;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log("[generatePersonasDeepProfileAction] ERROR: " + errorMsg);
    if (error instanceof Error && error.stack) {
      log("[generatePersonasDeepProfileAction] Stack: " + error.stack);
    }
    throw error;
  }
}

export async function generatePersonaComparisonAnalysisAction(
  slug: string,
  personas: PersonaDeepProfile[],
  audienceResearch: AudienceResearchPhase1
): Promise<PersonaComparisonAnalysis> {
  "use server";

  try {
    const workspace = await getPromiseWorkspace(slug);

    const phase3 = await maybeGeneratePersonaComparisonAnalysis(
      personas,
      workspace.bookSetupProfile
    );

    // Save to artifact
    const book = await getOrCreateBookBySlug(slug);
    await createPromiseArtifactVersion({
      bookId: book.id,
      artifactType: ArtifactType.AUDIENCE_RESEARCH,
      title: "Audience Research",
      summary: "Phase 3: Persona Comparison Analysis",
      contentJson: {
        phase: 3,
        phase1: audienceResearch,
        phase2: { personas },
        phase3,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      } as AudienceResearchArtifact,
    });

    // Don't revalidate - let the client handle the state update
    // revalidatePath(`/books/${slug}/promise`);
    return phase3;
  } catch (error) {
    console.error("[generatePersonaComparisonAnalysisAction] Error:", error);
    throw error;
  }
}

export async function regeneratePersonaSectionAction(
  slug: string,
  personaId: string,
  sectionName: string,
  feedback: string
): Promise<PersonaDeepProfile> {
  "use server";

  try {
    // This is a placeholder - actual regeneration would need to:
    // 1. Fetch the persona from artifact
    // 2. Call a regeneration function with feedback
    // 3. Update the artifact with new data

    const workspace = await getPromiseWorkspace(slug);
    const persona = workspace.audienceResearch?.phase2?.personas.find(
      (candidate) => candidate.id === personaId
    );

    if (!persona) {
      throw new Error(`Persona ${personaId} not found`);
    }

    // Return the persona as-is for now
    // In a full implementation, this would regenerate the specific section
    return persona;
  } catch (error) {
    console.error("[regeneratePersonaSectionAction] Error:", error);
    throw error;
  }
}

export async function generateCoreTruthsAction(slug: string): Promise<CoreTruthsArtifact> {
  "use server";

  try {
    const workspace = await getPromiseWorkspace(slug);

    if (!workspace.promiseBrief) {
      throw new Error("Promise brief not found. Generate promise first.");
    }

    // Get book for knowledge base access
    const book = await getOrCreateBookBySlug(slug);

    const coreTruths = await maybeGenerateCoreTruths(
      workspace.promiseBrief,
      workspace.audienceResearch,
      workspace.audienceResearch?.phase2?.personas,
      workspace.personas?.personas,
      workspace.bookSetupProfile,
      book.id
    );

    // Save to artifact
    await createPromiseArtifactVersion({
      bookId: book.id,
      artifactType: ArtifactType.CORE_TRUTHS,
      title: "TRUTH",
      summary: coreTruths.completeTruth,
      contentJson: coreTruths,
    });

    return coreTruths;
  } catch (error) {
    console.error("[generateCoreTruthsAction] Error:", error);
    throw error;
  }
}

export async function generateTransformationArcAction(slug: string): Promise<TransformationArtifact> {
  "use server";

  try {
    const workspace = await getPromiseWorkspace(slug);

    if (!workspace.promiseBrief) {
      throw new Error("Promise brief not found. Generate promise first.");
    }

    // Get book for knowledge base access
    const book = await getOrCreateBookBySlug(slug);

    const transformationArc = await maybeGenerateTransformationArc(
      workspace.promiseBrief,
      workspace.audienceResearch?.phase2?.personas,
      workspace.personas?.personas,
      workspace.bookSetupProfile,
      book.id
    );

    // Save to artifact
    await createPromiseArtifactVersion({
      bookId: book.id,
      artifactType: ArtifactType.TRANSFORMATION_ARC,
      title: "Transformation Arc",
      summary: "Reader transformation journey from before to after",
      contentJson: transformationArc,
    });

    return transformationArc;
  } catch (error) {
    console.error("[generateTransformationArcAction] Error:", error);
    throw error;
  }
}

export async function generatePositioningRecommendationsAction(
  slug: string,
): Promise<PositioningRecommendations> {
  "use server";

  try {
    const workspace = await getPromiseWorkspace(slug);
    const book = await getOrCreateBookBySlug(slug);

    const recommendations = await maybeGenerateRecommendations(
      workspace.promiseBrief,
      workspace.market,
      workspace.personas,
      workspace.audienceResearch,
      workspace.coreTruths,
      workspace.transformationArc,
      workspace.bookSetupProfile,
      book.id,
    );
    const normalizedRecommendations: PositioningRecommendations = recommendations;

    await createPromiseArtifactVersion({
      bookId: book.id,
      artifactType: ArtifactType.POSITIONING_RECOMMENDATIONS,
      title: "Recommendations Blueprint",
      summary: normalizedRecommendations.summary,
      contentJson: normalizedRecommendations,
      contentText: normalizedRecommendations.summary,
    });

    revalidatePath(`/books/${slug}`);
    return normalizedRecommendations;
  } catch (error) {
    console.error("[generatePositioningRecommendationsAction] Error:", error);
    throw error;
  }
}

export async function generateTitleSubtitleFinalizationAction(
  slug: string,
): Promise<TitleSubtitleFinalization> {
  "use server";

  try {
    const workspace = await getPromiseWorkspace(slug);
    const book = await getOrCreateBookBySlug(slug);

    return await maybeGenerateTitleSubtitleFinalization(
      workspace.promiseBrief,
      workspace.market,
      workspace.recommendations,
      workspace.personas,
      workspace.audienceResearch,
      workspace.coreTruths,
      workspace.transformationArc,
      workspace.bookSetupProfile,
      book.id,
    );
  } catch (error) {
    console.error("[generateTitleSubtitleFinalizationAction] Error:", error);
    throw error;
  }
}

export async function saveTitleSubtitleFinalizationAction(
  slug: string,
  input: TitleSubtitleFinalization,
): Promise<TitleSubtitleFinalization> {
  "use server";

  const workspace = await getPromiseWorkspace(slug);
  const book = await getOrCreateBookBySlug(slug);
  const stageMetadata =
    workspace.stage?.metadataJson && typeof workspace.stage.metadataJson === "object"
      ? workspace.stage.metadataJson
      : {};

  const titleSubtitleFinalization = sanitizeTitleSubtitleFinalization(
    input,
    workspace.titleSubtitleFinalization,
  );

  const phaseApprovals = mergePromisePhaseApprovals(
    workspace.phaseApprovals,
    "book-promise",
    {
      status: "pending",
    },
  );

  await updateStageForBook(book.id, StageKey.PROMISE, {
    status: StageStatus.IN_PROGRESS,
    startedAt: workspace.stage?.startedAt ?? new Date(),
    metadataJson: {
      ...stageMetadata,
      titleSubtitleFinalization,
      phaseApprovals,
    },
  });

  await updateBookTitleMetadata(book.id, {
    titleWorking: titleSubtitleFinalization.finalizedTitle,
    subtitle: titleSubtitleFinalization.finalizedSubtitle,
  });

  await createDirectionEvent({
    bookId: book.id,
    stageKey: StageKey.PROMISE,
    eventType: "PROMISE_USER_DIRECTION",
    title: "Finalized working title and subtitle",
    content: `${titleSubtitleFinalization.finalizedTitle}: ${titleSubtitleFinalization.finalizedSubtitle}`,
    metadataJson: {
      titleSubtitleFinalization,
      phaseApprovals,
    },
  });

  revalidatePath(`/books/${slug}`);
  return titleSubtitleFinalization;
}

export async function compileBookPromiseReportAction(
  slug: string,
): Promise<BookPromiseReport> {
  "use server";

  try {
    const workspace = await getPromiseWorkspace(slug);
    const book = await getOrCreateBookBySlug(slug);

    const report = await maybeGenerateBookPromiseReport(
      workspace.promiseBrief,
      workspace.market,
      workspace.recommendations,
      workspace.personas,
      workspace.audienceResearch,
      workspace.coreTruths,
      workspace.transformationArc,
      workspace.bookSetupProfile,
      workspace.titleSubtitleFinalization,
      book.id,
    );

    await createPromiseArtifactVersion({
      bookId: book.id,
      artifactType: ArtifactType.BOOK_PROMISE_REPORT,
      title: "Book Pitch Package",
      summary: report.executiveSummary.slice(0, 180),
      contentJson: report,
      contentText: report.documentMarkdown,
    });

    revalidatePath(`/books/${slug}`);
    return report;
  } catch (error) {
    console.error("[compileBookPromiseReportAction] Error:", error);
    throw error;
  }
}

export async function saveBookPromiseReportAction(
  slug: string,
  documentMarkdown: string,
): Promise<BookPromiseReport> {
  "use server";

  const markdown = documentMarkdown.trim();
  if (!markdown) {
    throw new Error("Book pitch document cannot be empty.");
  }

  const workspace = await getPromiseWorkspace(slug);
  const book = await getOrCreateBookBySlug(slug);

  const composed = composeBookPromiseReportFromMarkdown(
    markdown,
    workspace.promiseBrief,
    workspace.market,
    workspace.recommendations,
    workspace.personas,
    workspace.audienceResearch,
    workspace.coreTruths,
    workspace.transformationArc,
    workspace.bookSetupProfile,
    workspace.titleSubtitleFinalization,
    workspace.bookPromiseReport,
  );
  const report: BookPromiseReport = {
    ...composed,
    metadata: {
      ...(composed.metadata ?? {}),
      updatedAt: new Date().toISOString(),
      model: "manual-edit",
    },
  };

  await createPromiseArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.BOOK_PROMISE_REPORT,
    title: "Book Pitch Package",
    summary: report.executiveSummary.slice(0, 180),
    contentJson: report,
    contentText: report.documentMarkdown,
  });

  const stageMetadata =
    workspace.stage?.metadataJson && typeof workspace.stage.metadataJson === "object"
      ? workspace.stage.metadataJson
      : {};
  const phaseApprovals = mergePromisePhaseApprovals(
    workspace.phaseApprovals,
    "book-promise",
    {
      status: "pending",
    },
  );

  await updateStageForBook(book.id, StageKey.PROMISE, {
    status: StageStatus.IN_PROGRESS,
    startedAt: workspace.stage?.startedAt ?? new Date(),
    metadataJson: {
      ...stageMetadata,
      phaseApprovals,
    },
  });

  revalidatePath(`/books/${slug}`);
  return report;
}

export async function generatePromiseFromSetupAction(slug: string): Promise<any> {
  "use server";

  try {
    console.log("[generatePromiseFromSetupAction] Starting comprehensive promise generation from setup");
    const workspace = await getPromiseWorkspace(slug);
    const book = await getOrCreateBookBySlug(slug);

    if (!workspace.book) {
      throw new Error("Book not found");
    }

    // Generate comprehensive promise statement directly
    console.log("[generatePromiseFromSetupAction] Calling generateComprehensivePromiseStatement...");
    const comprehensivePromise = await generateComprehensivePromiseStatement(
      workspace.bookSetupProfile,
      book.id
    );
    console.log("[generatePromiseFromSetupAction] Promise generated, length:", comprehensivePromise.length);

    // Create/update the promise artifact with the generated comprehensive promise
    const updatedPromiseBrief = {
      ...workspace.promiseBrief,
      promiseStatement: comprehensivePromise,
    };

    await createPromiseArtifactVersion({
      bookId: book.id,
      artifactType: ArtifactType.PROMISE_BRIEF,
      title: "Promise Brief",
      summary: comprehensivePromise.substring(0, 150),
      contentJson: updatedPromiseBrief,
      contentText: comprehensivePromise,
      createdByType: ActorType.USER,
    });

    console.log("[generatePromiseFromSetupAction] Promise artifact saved");

    // Return the updated promise brief
    return updatedPromiseBrief;
  } catch (error) {
    console.error("[generatePromiseFromSetupAction] Error:", error);
    throw error;
  }
}
