"use server";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma, StageKey, StageStatus } from "@prisma/client";

import { BookOutlineSchema, parseArtifactWithSchema } from "@/lib/artifact-schemas";
import { getModelForRole } from "@/lib/llm/routing";
import { BookOutline, OutlineChapter } from "@/lib/outline-types";
import {
  commitOutlineWorkflow,
  finalizeOutlineWorkflow,
  runOutlineWorkflow,
} from "@/lib/workflows/outline";
import {
  commitParagraphOutlineWorkflow,
  runParagraphOutlineWorkflow,
  generateChapterParagraphPlan,
} from "@/lib/workflows/outline-paragraphs";
import {
  appendOutlinePhaseChats,
  generateOutlineTocArtifactWorkflow,
  getStoredOutlineTocArtifact,
  mergeOutlinePhaseApprovals,
  normalizeOutlinePhaseApprovals,
  normalizeOutlinePhaseChats,
} from "@/lib/workflows/outline-toc";
import { getBookBySlugOrThrow, getStageForBook, updateStageForBook } from "@/lib/repositories/books";
import { saveChapterParagraphPlan } from "@/lib/repositories/chapter-paragraph-artifacts";
import { getCommittedOutline } from "@/lib/repositories/outline-artifacts";
import { ActorType } from "@prisma/client";

type OutlinePhaseId = "sectionsChapters" | "chapterBreakdowns" | "fullToc";

function stageMetadataRecord(value: unknown) {
  return value && typeof value === "object" ? value : {};
}

function asJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function appendOutlineChatMessages(
  slug: string,
  phase: OutlinePhaseId,
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    createdAt: string;
  }>,
) {
  const book = await getBookBySlugOrThrow(slug);
  const stage = await getStageForBook(book.id, StageKey.OUTLINE);
  const stageMetadata = stageMetadataRecord(stage?.metadataJson) as Record<string, unknown>;
  const chats = appendOutlinePhaseChats(
    normalizeOutlinePhaseChats(stage?.metadataJson),
    phase,
    messages,
  );

  await updateStageForBook(book.id, StageKey.OUTLINE, {
    status: stage?.status ?? StageStatus.IN_PROGRESS,
    startedAt: stage?.startedAt ?? new Date(),
    metadataJson: asJsonValue({
      ...stageMetadata,
      outlinePhaseChats: chats,
    }),
  });

  return chats;
}

function phaseDisplayName(phase: OutlinePhaseId) {
  switch (phase) {
    case "sectionsChapters":
      return "Phase 1";
    case "chapterBreakdowns":
      return "Phase 2";
    case "fullToc":
      return "Phase 3";
  }
}

function buildOutlineAssistantReply(input: {
  phase: OutlinePhaseId;
  targetLabel?: string;
}) {
  const focus = input.targetLabel ? ` focusing on ${input.targetLabel}` : "";

  if (input.phase === "sectionsChapters") {
    return `I regenerated ${phaseDisplayName(input.phase)}${focus} and refreshed the section/chapter architecture. Review the updated flow, then approve this phase to unlock Commit Outline.`;
  }

  if (input.phase === "chapterBreakdowns") {
    return `I regenerated ${phaseDisplayName(input.phase)}${focus} and refreshed the paragraph blueprints. Review the updated paragraph math, hook placement, and chapter skeleton, then approve this phase when it feels right.`;
  }

  return `I reassembled the final Table of Contents from the locked Phase 1 and Phase 2 artifacts${focus ? `, with attention to ${input.targetLabel}` : ""}. If you want structural changes, send them back through Phase 1 or Phase 2 first, then regenerate the ToC here.`;
}

function buildOutlineFallbackReply(input: {
  phase: OutlinePhaseId;
  targetLabel?: string;
  reason?: string;
}) {
  const focus = input.targetLabel ? ` for ${input.targetLabel}` : "";

  if (input.phase === "sectionsChapters") {
    return `I tried to update Phase 1${focus}, but Sonnet did not complete successfully, so the local fallback scaffold was used only for diagnostics and no new outline draft was saved. Your requested change is still pending a real model pass.${input.reason ? ` Last issue: ${input.reason}` : ""}`;
  }

  if (input.phase === "chapterBreakdowns") {
    return `I tried to update Phase 2${focus}, but the model did not complete successfully and the fallback breakdown scaffold was used instead. Your requested change may not be reflected yet.${input.reason ? ` Last issue: ${input.reason}` : ""}`;
  }

  return `I reassembled the ToC${focus}, but any structural change still has to happen in Phase 1 or Phase 2 before Phase 3 can reflect it.`;
}

function extractTextFromModelResponse(response: unknown): string {
  if (!response) {
    return "";
  }

  if (typeof response === "string") {
    return response;
  }

  const record = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
  const content = record.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        const entryRecord =
          entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
        if (typeof entryRecord.text === "string") {
          return entryRecord.text;
        }
        if (entryRecord.type === "text" && typeof entryRecord.value === "string") {
          return entryRecord.value;
        }
        return "";
      })
      .join("");
  }

  if (typeof record.text === "string") {
    return record.text;
  }

  return "";
}

async function maybeGeneratePhaseThreeReply(input: {
  userMessage: string;
  targetLabel?: string;
  verificationReady?: boolean;
  structureSummary?: {
    sections: number;
    chapters: number;
    paragraphs: number;
  };
}) {
  const fallback = buildOutlineAssistantReply({
    phase: "fullToc",
    targetLabel: input.targetLabel,
  });

  const model = await getModelForRole("outline:phase-3", {
    temperature: 0.2,
    maxOutputTokens: 500,
    timeoutMs: 30000,
  });

  if (!model) {
    return fallback;
  }

  try {
    const response = await model.invoke([
      new SystemMessage(
        "You are the Phase 3 Outline reviewer. You are helping with final Table of Contents review only. Keep the response under 120 words. Be direct and practical. If the request belongs in Phase 1 or Phase 2, say so explicitly. If the ToC is valid, explain what was reassembled and what the author should review next. Do not invent structural changes.",
      ),
      new HumanMessage(
        JSON.stringify({
          userMessage: input.userMessage,
          targetLabel: input.targetLabel ?? null,
          verificationReady: input.verificationReady ?? false,
          structureSummary: input.structureSummary ?? null,
        }),
      ),
    ]);

    const text = extractTextFromModelResponse(response).trim();
    return text || fallback;
  } catch {
    return fallback;
  }
}

async function setOutlinePhaseApproval(
  slug: string,
  phase: OutlinePhaseId,
  status: "pending" | "approved",
) {
  const book = await getBookBySlugOrThrow(slug);
  const stage = await getStageForBook(book.id, StageKey.OUTLINE);
  const stageMetadata = stageMetadataRecord(stage?.metadataJson);
  const approvals = mergeOutlinePhaseApprovals(
    normalizeOutlinePhaseApprovals(stage?.metadataJson),
    phase,
    status === "approved"
      ? {
          status: "approved",
          approvedAt: new Date().toISOString(),
        }
      : {
          status: "pending",
          approvedAt: undefined,
        },
  );

  await updateStageForBook(book.id, StageKey.OUTLINE, {
    status: stage?.status ?? StageStatus.IN_PROGRESS,
    startedAt: stage?.startedAt ?? new Date(),
    metadataJson: {
      ...stageMetadata,
      outlinePhaseApprovals: approvals,
    },
  });
}

async function resetOutlineApprovalsAfterPhaseChange(
  slug: string,
  phase: OutlinePhaseId,
) {
  const book = await getBookBySlugOrThrow(slug);
  const stage = await getStageForBook(book.id, StageKey.OUTLINE);
  const stageMetadata = stageMetadataRecord(stage?.metadataJson) as Record<string, unknown>;
  let approvals = normalizeOutlinePhaseApprovals(stage?.metadataJson);

  if (phase === "sectionsChapters") {
    approvals = {
      sectionsChapters: { status: "pending" },
      chapterBreakdowns: { status: "pending" },
      fullToc: { status: "pending" },
    };
  } else if (phase === "chapterBreakdowns") {
    approvals = {
      ...approvals,
      chapterBreakdowns: { status: "pending" },
      fullToc: { status: "pending" },
    };
  } else {
    approvals = {
      ...approvals,
      fullToc: { status: "pending" },
    };
  }

  const nextMetadata: Record<string, unknown> = {
    ...stageMetadata,
    outlinePhaseApprovals: approvals,
  };

  if (phase === "sectionsChapters" || phase === "chapterBreakdowns") {
    delete nextMetadata.outlineTocArtifact;
  }

  await updateStageForBook(book.id, StageKey.OUTLINE, {
    status: stage?.status === StageStatus.COMMITTED ? StageStatus.IN_PROGRESS : stage?.status,
    startedAt: stage?.startedAt ?? new Date(),
    metadataJson: asJsonValue(nextMetadata),
  });
}

export async function generateOutline(slug: string, formData: FormData) {
  const note = String(formData.get("note") ?? "").trim();

  await runOutlineWorkflow(slug, {
    userInput: note || undefined,
  });
  await resetOutlineApprovalsAfterPhaseChange(slug, "sectionsChapters");

  revalidatePath(`/books/${slug}`);
}

export async function commentOnOutlineItem(slug: string, formData: FormData) {
  const comment = String(formData.get("comment") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim();
  const targetTypeValue = String(formData.get("targetType") ?? "").trim();
  const targetType =
    targetTypeValue === "chapter" || targetTypeValue === "section"
      ? targetTypeValue
      : undefined;

  await runOutlineWorkflow(slug, {
    revisionComment: comment || "Sharpen this part of the outline while keeping the book coherent.",
    revisionTargetId: targetId || undefined,
    revisionTargetType: targetType,
  });
  await resetOutlineApprovalsAfterPhaseChange(slug, "sectionsChapters");

  revalidatePath(`/books/${slug}`);
}

export async function commitOutlineStage(slug: string) {
  const book = await getBookBySlugOrThrow(slug);
  const stage = await getStageForBook(book.id, StageKey.OUTLINE);
  const approvals = normalizeOutlinePhaseApprovals(stage?.metadataJson);

  if (approvals.sectionsChapters.status !== "approved") {
    throw new Error("Approve Phase 1 before committing the outline.");
  }

  await commitOutlineWorkflow(slug);
  await updateStageForBook(book.id, StageKey.OUTLINE, {
    status: StageStatus.IN_PROGRESS,
    startedAt: stage?.startedAt ?? new Date(),
    metadataJson: {
      ...stageMetadataRecord(stage?.metadataJson),
      outlinePhaseApprovals: {
        sectionsChapters: approvals.sectionsChapters,
        chapterBreakdowns: { status: "pending" },
        fullToc: { status: "pending" },
      },
    },
  });
  revalidatePath(`/books/${slug}`);
  redirect(`/books/${slug}?stage=OUTLINE&phase=chapter-breakdowns`);
}

export async function generateParagraphOutlineFromOutline(slug: string) {
  await runParagraphOutlineWorkflow(slug);
  await resetOutlineApprovalsAfterPhaseChange(slug, "chapterBreakdowns");
  revalidatePath(`/books/${slug}`);
}

export async function commentOnParagraphOutlineFromOutline(
  slug: string,
  formData: FormData,
) {
  const comment = String(formData.get("comment") ?? "").trim();
  const targetId = String(formData.get("targetId") ?? "").trim();
  const targetTypeValue = String(formData.get("targetType") ?? "").trim();
  const targetType =
    targetTypeValue === "chapter" || targetTypeValue === "paragraph"
      ? targetTypeValue
      : undefined;

  await runParagraphOutlineWorkflow(slug, {
    revisionComment:
      comment ||
      "Sharpen this chapter breakdown while preserving the locked outline and paragraph math.",
    revisionTargetId: targetId || undefined,
    revisionTargetType: targetType,
  });
  await resetOutlineApprovalsAfterPhaseChange(slug, "chapterBreakdowns");

  revalidatePath(`/books/${slug}`);
}

export async function commitParagraphOutlineFromOutline(slug: string) {
  const book = await getBookBySlugOrThrow(slug);
  const stage = await getStageForBook(book.id, StageKey.OUTLINE);
  const approvals = normalizeOutlinePhaseApprovals(stage?.metadataJson);

  if (approvals.chapterBreakdowns.status !== "approved") {
    throw new Error("Approve Phase 2 before committing the chapter breakdowns.");
  }

  await commitParagraphOutlineWorkflow(slug);
  const nextMetadata = {
    ...stageMetadataRecord(stage?.metadataJson),
    outlinePhaseApprovals: {
      ...approvals,
      fullToc: { status: "pending" },
    },
  } as Record<string, unknown>;
  delete nextMetadata.outlineTocArtifact;
  await updateStageForBook(book.id, StageKey.OUTLINE, {
    status: StageStatus.IN_PROGRESS,
    startedAt: stage?.startedAt ?? new Date(),
    metadataJson: asJsonValue(nextMetadata),
  });
  revalidatePath(`/books/${slug}`);
  redirect(`/books/${slug}?stage=OUTLINE&phase=full-toc`);
}

export async function generateOutlineToc(slug: string) {
  await generateOutlineTocArtifactWorkflow(slug);
  revalidatePath(`/books/${slug}`);
}

export async function approveOutlinePhase(slug: string, phase: OutlinePhaseId) {
  await setOutlinePhaseApproval(slug, phase, "approved");
  revalidatePath(`/books/${slug}`);
}

export async function requestOutlinePhaseChanges(slug: string, phase: OutlinePhaseId) {
  await setOutlinePhaseApproval(slug, phase, "pending");
  revalidatePath(`/books/${slug}`);
}

export async function sendOutlinePhaseMessage(
  slug: string,
  phase: OutlinePhaseId,
  message: string,
  targetType?: string,
  targetId?: string,
  targetLabel?: string,
) {
  const trimmed = message.trim();
  if (!trimmed) {
    return {
      messages: normalizeOutlinePhaseChats((await getStageForBook((await getBookBySlugOrThrow(slug)).id, StageKey.OUTLINE))?.metadataJson)[phase],
      error: null,
    };
  }

  const timestamp = new Date().toISOString();
  await appendOutlineChatMessages(slug, phase, [
    {
      role: "user",
      content: trimmed,
      createdAt: timestamp,
    },
  ]);

  try {
    if (phase === "sectionsChapters") {
      const outlineTargetType =
        targetType === "section" || targetType === "chapter" ? targetType : undefined;

      const result = await runOutlineWorkflow(slug, {
        revisionComment: trimmed,
        revisionTargetId: outlineTargetType ? targetId || undefined : undefined,
        revisionTargetType: outlineTargetType,
      });
      await resetOutlineApprovalsAfterPhaseChange(slug, "sectionsChapters");

      const outline =
        result && typeof result === "object" && "outline" in result
          ? (result as { outline?: { generationMeta?: { source?: string; reason?: string } } })
              .outline
          : undefined;

      const assistantReply =
        outline?.generationMeta?.source === "fallback"
          ? buildOutlineFallbackReply({
              phase,
              targetLabel,
              reason: outline.generationMeta.reason,
            })
          : buildOutlineAssistantReply({
              phase,
              targetLabel,
            });

      const chats = await appendOutlineChatMessages(slug, phase, [
        {
          role: "assistant",
          content: assistantReply,
          createdAt: new Date().toISOString(),
        },
      ]);

      revalidatePath(`/books/${slug}`);
      revalidatePath(`/books/${slug}/base-story`);

      return {
        messages: chats[phase],
        error:
          outline?.generationMeta?.source === "fallback"
            ? outline.generationMeta.reason ?? "Fallback scaffold used instead of model output"
            : null,
      };
    } else if (phase === "chapterBreakdowns") {
      const breakdownTargetType =
        targetType === "chapter" || targetType === "paragraph" ? targetType : undefined;

      await runParagraphOutlineWorkflow(slug, {
        revisionComment: trimmed,
        revisionTargetId: breakdownTargetType ? targetId || undefined : undefined,
        revisionTargetType: breakdownTargetType,
      });
      await resetOutlineApprovalsAfterPhaseChange(slug, "chapterBreakdowns");

      const assistantReply = buildOutlineAssistantReply({
        phase,
        targetLabel,
      });
      const chats = await appendOutlineChatMessages(slug, phase, [
        {
          role: "assistant",
          content: assistantReply,
          createdAt: new Date().toISOString(),
        },
      ]);

      revalidatePath(`/books/${slug}`);
      revalidatePath(`/books/${slug}/base-story`);

      return {
        messages: chats[phase],
        error: null,
      };
    } else {
      const tocArtifact = await generateOutlineTocArtifactWorkflow(slug);
      const assistantReply = await maybeGeneratePhaseThreeReply({
        userMessage: trimmed,
        targetLabel,
        verificationReady: tocArtifact.verificationReport.ready,
        structureSummary: tocArtifact.verificationReport.structureSummary,
      });
      const chats = await appendOutlineChatMessages(slug, phase, [
        {
          role: "assistant",
          content: assistantReply,
          createdAt: new Date().toISOString(),
        },
      ]);

      revalidatePath(`/books/${slug}`);
      revalidatePath(`/books/${slug}/base-story`);

      return {
        messages: chats[phase],
        error: null,
      };
    }

    const assistantReply = buildOutlineAssistantReply({
      phase,
      targetLabel,
    });
    const chats = await appendOutlineChatMessages(slug, phase, [
      {
        role: "assistant",
        content: assistantReply,
        createdAt: new Date().toISOString(),
      },
    ]);

    revalidatePath(`/books/${slug}`);
    revalidatePath(`/books/${slug}/base-story`);

    return {
      messages: chats[phase],
      error: null,
    };
  } catch (error) {
    const assistantReply =
      phase === "fullToc"
        ? await maybeGeneratePhaseThreeReply({
            userMessage:
              error instanceof Error ? `${trimmed}\n\nError: ${error.message}` : trimmed,
            targetLabel,
            verificationReady: false,
          })
        : error instanceof Error
          ? `I couldn't complete ${phaseDisplayName(phase)} right now: ${error.message}`
          : `I couldn't complete ${phaseDisplayName(phase)} right now.`;
    const chats = await appendOutlineChatMessages(slug, phase, [
      {
        role: "assistant",
        content: assistantReply,
        createdAt: new Date().toISOString(),
      },
    ]);

    revalidatePath(`/books/${slug}`);

    return {
      messages: chats[phase],
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function finalizeOutlinePackage(slug: string) {
  const book = await getBookBySlugOrThrow(slug);
  const stage = await getStageForBook(book.id, StageKey.OUTLINE);
  const metadata = stageMetadataRecord(stage?.metadataJson) as Record<string, unknown>;
  const approvals = normalizeOutlinePhaseApprovals(stage?.metadataJson);
  const tocArtifact = getStoredOutlineTocArtifact(stage?.metadataJson);

  if (approvals.fullToc.status !== "approved") {
    throw new Error("Approve the final Table of Contents before committing the outline.");
  }

  if (!tocArtifact) {
    throw new Error("Generate the final Table of Contents before committing the outline.");
  }

  await updateStageForBook(book.id, StageKey.OUTLINE, {
    status: StageStatus.COMMITTED,
    startedAt: stage?.startedAt ?? new Date(),
    metadataJson: {
      ...metadata,
      outlinePhaseApprovals: approvals,
    },
  });

  await finalizeOutlineWorkflow(slug);
  revalidatePath(`/books/${slug}`);
  revalidatePath(`/books/${slug}/base-story`);
  revalidatePath(`/books/${slug}/research`);
  revalidatePath(`/books/${slug}/external-stories`);
  revalidatePath(`/books/${slug}/dashboard`);
  redirect(`/books/${slug}/base-story`);
}

export async function regenerateChapterBreakdown(slug: string, chapterId: string) {
  try {
    console.log(`[regenerateChapterBreakdown] Starting for chapter: ${chapterId}`);

    const book = await getBookBySlugOrThrow(slug);
    console.log(`[regenerateChapterBreakdown] Got book: ${book.id}`);

    const committedOutlineVersion = await getCommittedOutline(book.id);
    console.log(`[regenerateChapterBreakdown] Got committed outline version: ${committedOutlineVersion?.id}`);

    const committedOutline = parseArtifactWithSchema(
      committedOutlineVersion?.contentJson,
      BookOutlineSchema,
    );

    if (!committedOutline) {
      throw new Error("No committed outline found. Generate and commit Phase 1 first.");
    }

    console.log(`[regenerateChapterBreakdown] Found outline with ${committedOutline.sections.length} sections`);

    // Find the chapter in the outline
    let chapter: OutlineChapter | null = null;
    let sectionId = "";
    for (const section of committedOutline.sections) {
      for (const ch of section.chapters) {
        if (ch.id === chapterId) {
          chapter = ch;
          sectionId = section.id;
          break;
        }
      }
      if (chapter) break;
    }

    if (!chapter) {
      throw new Error(`Chapter with ID ${chapterId} not found in the committed outline`);
    }

    console.log(`[regenerateChapterBreakdown] Found chapter: ${chapter.title}`);

    // Generate the chapter paragraph plan
    const bookContext = {
      title: committedOutline.workingTitle,
      wordCountTarget: committedOutline.targetWordCount,
    };

    console.log(`[regenerateChapterBreakdown] Calling generateChapterParagraphPlan`);
    const plan = await generateChapterParagraphPlan(chapter, bookContext);
    console.log(`[regenerateChapterBreakdown] Generated plan with ${plan.paragraphs.length} paragraphs`);

    // Save the chapter paragraph plan
    console.log(`[regenerateChapterBreakdown] Saving chapter paragraph plan`);
    await saveChapterParagraphPlan({
      bookId: book.id,
      chapterId: chapter.id,
      chapterNumber: chapter.number,
      chapterTitle: chapter.title,
      sectionId,
      contentJson: plan,
      createdByType: ActorType.SYSTEM,
      modelName: "claude-sonnet-4-6",
    });

    console.log(`[regenerateChapterBreakdown] Resetting approvals`);
    await resetOutlineApprovalsAfterPhaseChange(slug, "chapterBreakdowns");

    console.log(`[regenerateChapterBreakdown] Revalidating path`);
    revalidatePath(`/books/${slug}`);

    console.log(`[regenerateChapterBreakdown] Complete`);
  } catch (error) {
    console.error("[regenerateChapterBreakdown] ERROR:", error instanceof Error ? error.message : String(error));
    if (error instanceof Error) {
      console.error("[regenerateChapterBreakdown] Stack:", error.stack);
    }
    throw error;
  }
}
