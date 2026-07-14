import { getBookBySlugOrThrow } from "../src/lib/repositories/books";
import {
  assembleManuscriptWorkflow,
  commitEditingStageWorkflow,
  getEditingWorkspace,
} from "../src/lib/workflows/editing-public";
import {
  runWorkflowAutopilot,
  setWorkflowAutomationMode,
} from "../src/lib/workflows/workflow-automation";

const results: Array<{
  slug: string;
  testedModes: string[];
  status: string;
  title: string;
  detail: string;
  mode: string | null;
  historyCount: number;
  prepareError: string;
  editingRecommendation: string;
}> = [];

async function main() {
  const trigger = () => {
    // Fixture books should already be complete; no background runs should be needed.
  };

  for (const slug of ["fiction-smoke", "nonfiction-smoke"]) {
    console.log(`[autopilot] prepare ${slug}`);
    await assembleManuscriptWorkflow(slug);
    let prepareError = "";
    try {
      await commitEditingStageWorkflow(slug);
    } catch (error) {
      prepareError = error instanceof Error ? error.message : String(error);
    }

    const testedModes = ["assisted", "run_to_next_boundary", "run_to_full_draft"] as const;
    let result = {
      status: "manual",
      title: "No result",
      detail: "",
    };

    for (const mode of testedModes) {
      console.log(`[autopilot] ${slug} -> ${mode}`);
      await setWorkflowAutomationMode(slug, mode);
      result = await runWorkflowAutopilot(slug, trigger, mode);
    }

    const book = await getBookBySlugOrThrow(slug);
    const metadata =
      book.metadataJson && typeof book.metadataJson === "object"
        ? (book.metadataJson as Record<string, unknown>)
        : {};
    const automation =
      metadata.workflowAutomation && typeof metadata.workflowAutomation === "object"
        ? (metadata.workflowAutomation as Record<string, unknown>)
        : null;
    const historyCount = Array.isArray(automation?.history) ? automation.history.length : 0;
    const editingWorkspace = await getEditingWorkspace(slug);
    results.push({
      slug,
      testedModes: [...testedModes],
      status: result.status,
      title: result.title,
      detail: result.detail,
      mode: typeof automation?.mode === "string" ? automation.mode : null,
      historyCount,
      prepareError,
      editingRecommendation: editingWorkspace.editorialReadinessGate.recommendation,
    });
  }

  console.log(JSON.stringify(results, null, 2));

  const failures = results.filter(
    (result) => {
      const validStatus =
        result.slug === "nonfiction-smoke"
          ? result.status === "complete" ||
            (result.status === "manual" && result.title === "Waiting on Personal Stories")
          : result.status === "complete" ||
            result.status === "advanced" ||
            (
              result.prepareError.includes("Editing is not ready to commit yet.") &&
              result.editingRecommendation === "blocked" &&
              (result.status === "blocked" || result.status === "manual" || result.status === "complete")
            );

      return !validStatus || result.mode !== "run_to_full_draft" || result.historyCount < result.testedModes.length;
    },
  );
  if (failures.length > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
