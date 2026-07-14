import { triggerWorkflowRunInBackground } from "../../workflow-queue";
import { enqueueAndTriggerBaseStoryWorkflow } from "../base-story";
import { enqueueAndTriggerFullExternalStoriesWorkflow } from "../external-stories";

export async function finalizeOutlineWorkflow(bookSlug: string) {
  await Promise.all([
    enqueueAndTriggerFullExternalStoriesWorkflow(bookSlug, triggerWorkflowRunInBackground),
    enqueueAndTriggerBaseStoryWorkflow(bookSlug, triggerWorkflowRunInBackground),
  ]);
}
