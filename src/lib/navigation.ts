import { getStageLinksForWorkflow } from "./workflow-registry";
import type { BookWorkflowType } from "@prisma/client";

export function getBookStageLinks(workflowType: BookWorkflowType, slug: string) {
  return getStageLinksForWorkflow(workflowType, slug);
}
