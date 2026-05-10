import { BookWorkflowType, StageKey, StageStatus } from "@prisma/client";

import { parseMetadataRecord } from "../artifact-schemas";
import { commitBaseStoryWorkflow, enqueueAndTriggerBaseStoryWorkflow } from "./base-story";
import { commitAllResearchWorkflow, enqueueAndTriggerFullResearchWorkflow } from "./research";
import {
  commitAllExternalStoriesWorkflow,
  enqueueAndTriggerFullExternalStoriesWorkflow,
} from "./external-stories";
import {
  commitAllChapterDraftsWorkflow,
  enqueueAndTriggerChapterDraftWorkflow,
  repairWeakChapterDraftsWorkflow,
} from "./chapter-draft";
import {
  commitEditingStageWorkflow,
  assembleManuscriptWorkflow,
  runFullEditorialLoopWorkflow,
} from "./editing";
import {
  commitFictionStageWorkflow,
  generateFictionStageWorkflow,
  repairWeakFictionDraftChaptersWorkflow,
} from "./fiction";
import {
  getBookBySlugOrThrow,
  getStageForBook,
  updateBookMetadata,
} from "../repositories/books";
import { getActiveWorkflowRunForStage } from "../repositories/workflow-runs";
import {
  getStageControlCapabilities,
  resumeFailedStageWorkflow,
  retryStageWorkflow,
} from "./stage-controls";

type AutomationSummary = {
  status: "advanced" | "launched" | "waiting" | "manual" | "complete" | "error";
  title: string;
  detail: string;
  at: string;
};

export type WorkflowAutomationMode =
  | "manual"
  | "assisted"
  | "continuous"
  | "run_to_next_boundary"
  | "run_to_full_draft";

type AutomationState = {
  enabled: boolean;
  mode: WorkflowAutomationMode;
  lastSummary?: AutomationSummary;
  history: AutomationSummary[];
};

type AutomationResult = {
  status: AutomationSummary["status"];
  title: string;
  detail: string;
};

function isAutomationSummary(value: unknown): value is AutomationSummary {
  return Boolean(
    value &&
      typeof value === "object" &&
      "status" in value &&
      "title" in value &&
      "detail" in value &&
      "at" in value,
  );
}

function getAutomationState(metadata: unknown): AutomationState {
  const current = parseMetadataRecord(metadata);
  const raw =
    current.workflowAutomation && typeof current.workflowAutomation === "object"
      ? (current.workflowAutomation as Record<string, unknown>)
      : null;

  const modeValue = raw?.mode;
  const mode: WorkflowAutomationMode =
    modeValue === "assisted" ||
    modeValue === "continuous" ||
    modeValue === "run_to_next_boundary" ||
    modeValue === "run_to_full_draft" ||
    modeValue === "manual"
      ? modeValue
      : raw?.enabled
        ? "continuous"
        : "manual";

  const history = Array.isArray(raw?.history)
    ? raw.history.filter(isAutomationSummary).slice(0, 10)
    : [];

  const lastSummary = isAutomationSummary(raw?.lastSummary) ? raw.lastSummary : history[0];

  return {
    enabled: Boolean(raw?.enabled),
    mode,
    lastSummary,
    history,
  };
}

async function writeAutomationState(
  bookId: string,
  metadata: unknown,
  nextState: Partial<AutomationState> & { lastSummary?: AutomationSummary },
) {
  const currentMetadata = parseMetadataRecord(metadata);
  const currentState = getAutomationState(metadata);
  const lastSummary = nextState.lastSummary ?? currentState.lastSummary;
  const history = nextState.lastSummary
    ? [nextState.lastSummary, ...currentState.history.filter((entry) => entry.at !== nextState.lastSummary?.at)].slice(0, 10)
    : currentState.history;

  await updateBookMetadata(bookId, {
    ...currentMetadata,
    workflowAutomation: {
      enabled: nextState.enabled ?? currentState.enabled,
      mode: nextState.mode ?? currentState.mode,
      lastSummary,
      history,
    },
  });
}

async function setAutomationMode(bookSlug: string, mode: WorkflowAutomationMode) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const enabled = mode === "continuous";
  const timestamp = new Date().toISOString();
  await writeAutomationState(book.id, book.metadataJson, {
    enabled,
    mode,
    lastSummary: enabled
      ? {
          status: "advanced",
          title: "Autopilot enabled",
          detail: "GHOSTWRITR will continue advancing the workflow whenever a background stage finishes and the next step is unblocked.",
          at: timestamp,
        }
      : mode === "manual"
        ? {
            status: "manual",
            title: "Autopilot disabled",
            detail: "Workflow progression is back in manual mode.",
            at: timestamp,
          }
        : {
            status: "advanced",
            title: "Automation mode updated",
            detail: `Workflow automation is now set to ${mode.replace(/_/g, " ")}.`,
            at: timestamp,
          },
  });
}

export async function enableWorkflowAutomation(bookSlug: string) {
  await setAutomationMode(bookSlug, "continuous");
}

export async function disableWorkflowAutomation(bookSlug: string) {
  await setAutomationMode(bookSlug, "manual");
}

export async function setWorkflowAutomationMode(bookSlug: string, mode: WorkflowAutomationMode) {
  await setAutomationMode(bookSlug, mode);
}

async function tryCommitThenGenerate(
  bookSlug: string,
  stageKey: StageKey,
) {
  try {
    await commitFictionStageWorkflow(bookSlug, stageKey);
    return { advanced: true, generated: false };
  } catch {
    await generateFictionStageWorkflow(bookSlug, stageKey);
    await commitFictionStageWorkflow(bookSlug, stageKey);
    return { advanced: true, generated: true };
  }
}

async function runFictionAutopilot(
  bookSlug: string,
  mode: WorkflowAutomationMode,
): Promise<AutomationResult> {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = async (stageKey: StageKey) => getStageForBook(book.id, stageKey);
  const fictionStages = [
    StageKey.STORY_SETUP,
    StageKey.STORY_CORE,
    StageKey.WORLD_CAST,
    StageKey.PLOT_BLUEPRINT,
    StageKey.SCENE_PLAN,
    StageKey.FICTION_DRAFT,
  ];
  const fictionStageStates = await Promise.all(
    fictionStages.map((stageKey) => stage(stageKey)),
  );
  const editingStage = await stage(StageKey.EDITING);

  if (
    fictionStageStates.every((entry) => entry?.status === StageStatus.COMMITTED) &&
    editingStage?.status === StageStatus.COMMITTED
  ) {
    return {
      status: "complete",
      title: "Fiction workflow complete",
      detail: "All fiction stages through Editing are committed.",
    };
  }

  const setupStage = await stage(StageKey.BOOK_SETUP);
  if (setupStage?.status !== StageStatus.COMMITTED) {
    return {
      status: "manual",
      title: "Waiting on Book Setup",
      detail: "Commit Book Setup before fiction autopilot can start planning the novel.",
    };
  }

  const advancedStages: string[] = [];

  for (const [index, stageKey] of fictionStages.entries()) {
    const currentStage = fictionStageStates[index];
    if (currentStage?.status !== StageStatus.COMMITTED) {
      if (mode === "assisted" && currentStage?.status !== StageStatus.READY_FOR_REVIEW) {
        return {
          status: "manual",
          title: `Assisted mode paused at ${stageKey.replace(/_/g, " ")}`,
          detail: "This mode only commits stages that are already generated and ready for review. Generate this fiction stage manually when you want to keep going.",
        };
      }

      const result =
        mode === "assisted"
          ? (await commitFictionStageWorkflow(bookSlug, stageKey), { advanced: true, generated: false })
          : await tryCommitThenGenerate(bookSlug, stageKey);
      advancedStages.push(
        `${stageKey.replace(/_/g, " ")}${result.generated ? " generated and committed" : " committed"}`,
      );

      if (mode === "assisted") {
        return {
          status: "advanced",
          title: "Assisted mode committed the next fiction stage",
          detail: advancedStages.join(". "),
        };
      }
    }
  }

  if (editingStage?.status !== StageStatus.COMMITTED) {
    if (mode === "assisted") {
      return {
        status: "manual",
        title: "Assisted mode paused at Editing",
        detail: "Run the editorial loop manually when you want to advance the manuscript through the final revision pass.",
      };
    }

    const repairedDrafts = await repairWeakFictionDraftChaptersWorkflow(bookSlug, 2);
    if (repairedDrafts.repairedChapterNumbers.length > 0) {
      return {
        status: "advanced",
        title: "Fiction draft repair loop ran",
        detail: `Repaired ${repairedDrafts.repairedChapterNumbers.length} weak fiction chapter draft(s) before the editorial pass.`,
      };
    }

    await assembleManuscriptWorkflow(bookSlug);
    await runFullEditorialLoopWorkflow(bookSlug, {
      assessmentMode: "structural-edit",
      planLimit: 2,
      autoApply: true,
      commitAfter: true,
    });
    advancedStages.push("Editing loop completed and committed");
  }

  if (advancedStages.length > 0) {
    return {
      status: "advanced",
      title: "Fiction autopilot advanced the workflow",
      detail: advancedStages.join(". "),
    };
  }
  return {
    status: "complete",
    title: "Fiction workflow complete",
    detail: "All fiction stages through Editing are committed.",
  };
}

async function runNonfictionAutopilot(
  bookSlug: string,
  trigger: (runId: string) => void,
  mode: WorkflowAutomationMode,
): Promise<AutomationResult> {
  const book = await getBookBySlugOrThrow(bookSlug);
  const stage = async (stageKey: StageKey) => getStageForBook(book.id, stageKey);

  const strategicBoundaryStages = [
    {
      key: StageKey.BOOK_SETUP,
      label: "Book Setup",
      detail: "Commit Book Setup before autopilot can continue downstream.",
    },
    {
      key: StageKey.PROMISE,
      label: "Promise",
      detail: "Promise is a human-shaped strategic stage. Commit it before downstream automation begins.",
    },
    {
      key: StageKey.OUTLINE,
      label: "Outline",
      detail: "Outline is still an approval boundary. Commit the full outline before autopilot continues.",
    },
    {
      key: StageKey.PERSONAL_STORIES,
      label: "Personal Stories",
      detail: "Personal Stories is the last human-sourced boundary before chapter drafting.",
    },
  ];

  for (const boundary of strategicBoundaryStages) {
    const currentStage = await stage(boundary.key);
    if (currentStage?.status !== StageStatus.COMMITTED) {
      return {
        status: "manual",
        title: `Waiting on ${boundary.label}`,
        detail: boundary.detail,
      };
    }
  }

  const backgroundStages = [
    {
      key: StageKey.BASE_STORY,
      label: "Base Story",
      enqueue: () => enqueueAndTriggerBaseStoryWorkflow(bookSlug, trigger),
      commit: () => commitBaseStoryWorkflow(bookSlug),
    },
    {
      key: StageKey.RESEARCH,
      label: "Research",
      enqueue: () => enqueueAndTriggerFullResearchWorkflow(bookSlug, trigger),
      commit: () => commitAllResearchWorkflow(bookSlug),
    },
    {
      key: StageKey.EXTERNAL_STORIES,
      label: "External Stories",
      enqueue: () => enqueueAndTriggerFullExternalStoriesWorkflow(bookSlug, trigger),
      commit: () => commitAllExternalStoriesWorkflow(bookSlug),
    },
    {
      key: StageKey.CHAPTER_DRAFT,
      label: "Chapter Draft",
      enqueue: () => enqueueAndTriggerChapterDraftWorkflow(bookSlug, trigger),
      commit: () => commitAllChapterDraftsWorkflow(bookSlug),
    },
  ];

  for (const item of backgroundStages) {
    const currentStage = await stage(item.key);
    if (currentStage?.status === StageStatus.COMMITTED) {
      continue;
    }

    if (mode === "assisted" && currentStage?.status !== StageStatus.READY_FOR_REVIEW) {
      return {
        status: "manual",
        title: `Assisted mode paused at ${item.label}`,
        detail: "This mode only commits stages that are already complete enough for review. Launch the next nonfiction generation stage manually when you want to continue.",
      };
    }

    const stageMetadata = parseMetadataRecord(currentStage?.metadataJson);
    const failedChapterCount = Array.isArray(stageMetadata.failedChapters)
      ? stageMetadata.failedChapters.length
      : 0;
    const automationStatus =
      typeof stageMetadata.automationStatus === "string" ? stageMetadata.automationStatus : null;
    const controls = getStageControlCapabilities(item.key);

    if (
      mode !== "assisted" &&
      currentStage?.status === StageStatus.BLOCKED &&
      controls.canResumeFailed &&
      failedChapterCount > 0
    ) {
      await resumeFailedStageWorkflow(bookSlug, item.key, trigger);
      return {
        status: "launched",
        title: `${item.label} resumed from failed chapters`,
        detail: `Autopilot detected ${failedChapterCount} failed chapter${failedChapterCount === 1 ? "" : "s"} and resumed only those chapters instead of restarting the whole stage.`,
      };
    }

    if (
      mode !== "assisted" &&
      (currentStage?.status === StageStatus.BLOCKED || automationStatus === "canceled") &&
      controls.canRetry
    ) {
      await retryStageWorkflow(bookSlug, item.key, trigger);
      return {
        status: "launched",
        title: `${item.label} relaunched`,
        detail:
          currentStage?.status === StageStatus.BLOCKED
            ? "Autopilot retried the blocked stage automatically so downstream work does not stall."
            : "Autopilot restarted the canceled stage automatically because the workflow is still set to keep going.",
      };
    }

    const activeRun = await getActiveWorkflowRunForStage(book.id, item.key);
    if (activeRun) {
      return {
        status: "waiting",
        title: `${item.label} already running`,
        detail: "Autopilot is waiting for the active background worker to finish.",
      };
    }

    if (currentStage?.status === StageStatus.READY_FOR_REVIEW) {
      const commitResult = await item.commit();
      if (
        commitResult &&
        typeof commitResult === "object" &&
        "missingChapterKeys" in commitResult &&
        Array.isArray((commitResult as { missingChapterKeys?: unknown }).missingChapterKeys) &&
        ((commitResult as { missingChapterKeys: unknown[] }).missingChapterKeys.length > 0)
      ) {
        return {
          status: "waiting",
          title: `${item.label} still needs material`,
          detail: "Autopilot committed every available dossier, but some chapters still do not have enough output to finish the stage.",
        };
      }
      continue;
    }

    await item.enqueue();
    return {
      status: "launched",
      title: `${item.label} launched`,
      detail: "Autopilot queued the next background stage and will continue after the worker finishes.",
    };
  }

  const editingStage = await stage(StageKey.EDITING);
  if (editingStage?.status !== StageStatus.COMMITTED) {
    if (mode === "assisted") {
      return {
        status: "manual",
        title: "Assisted mode paused at Editing",
        detail: "Run the editorial loop manually when you want to take the manuscript through the final revision pass.",
      };
    }

    const repairedDrafts = await repairWeakChapterDraftsWorkflow(bookSlug, 2);
    if (repairedDrafts.repairedChapterKeys.length > 0) {
      return {
        status: "advanced",
        title: "Nonfiction draft repair loop ran",
        detail: `Repaired ${repairedDrafts.repairedChapterKeys.length} weak nonfiction chapter draft(s) before Editing.`,
      };
    }

    await assembleManuscriptWorkflow(bookSlug);
    await runFullEditorialLoopWorkflow(bookSlug, {
      assessmentMode: "structural-edit",
      planLimit: 2,
      autoApply: true,
      commitAfter: true,
    });
    return {
      status: "advanced",
      title: "Editing committed",
      detail: "The full manuscript was assembled, revised through the editorial loop, and committed with a ready publishing package.",
    };
  }

  return {
    status: "complete",
    title: "Nonfiction workflow complete",
    detail: "All downstream nonfiction stages through Editing are committed.",
  };
}

export async function runWorkflowAutopilot(
  bookSlug: string,
  trigger: (runId: string) => void,
  modeOverride?: WorkflowAutomationMode,
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const automationState = getAutomationState(book.metadataJson);
  const mode = modeOverride ?? automationState.mode;
  const steps = mode === "manual" || mode === "assisted" ? 1 : 12;

  let latestResult: AutomationResult = {
    status: "manual",
    title: "Autopilot idle",
    detail: "No automation step has run yet.",
  };

  for (let index = 0; index < steps; index += 1) {
    latestResult =
      book.workflowType === BookWorkflowType.FICTION
        ? await runFictionAutopilot(bookSlug, mode)
        : await runNonfictionAutopilot(bookSlug, trigger, mode);

    const shouldContinue =
      (mode === "run_to_full_draft" || mode === "run_to_next_boundary") &&
      latestResult.status === "advanced";

    if (!shouldContinue) {
      break;
    }
  }

  await writeAutomationState(book.id, book.metadataJson, {
    enabled: mode === "continuous",
    mode,
    lastSummary: {
      status: latestResult.status,
      title: latestResult.title,
      detail: latestResult.detail,
      at: new Date().toISOString(),
    },
  });

  return latestResult;
}

export async function continueWorkflowAutomationIfEnabled(
  bookSlug: string,
  trigger: (runId: string) => void,
) {
  const book = await getBookBySlugOrThrow(bookSlug);
  const automationState = getAutomationState(book.metadataJson);
  if (!automationState.enabled) {
    return {
      status: "manual",
      title: "Autopilot disabled",
      detail: "Workflow continuation is currently manual.",
    } satisfies AutomationResult;
  }

  return runWorkflowAutopilot(bookSlug, trigger, automationState.mode);
}
