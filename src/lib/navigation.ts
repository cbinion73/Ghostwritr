import { BookWorkflowType } from "@prisma/client";

import { getStageLinksForWorkflow } from "./workflow-registry";

export const STAGE_LINKS = getStageLinksForWorkflow(BookWorkflowType.NONFICTION, "__SLUG__").map(
  (stage) => ({
    key: stage.key,
    label: stage.label,
    href: (slug: string) => stage.href.replace("__SLUG__", slug),
    description: stage.description,
  }),
);

export function getBookStageLinks(workflowType: BookWorkflowType, slug: string) {
  return getStageLinksForWorkflow(workflowType, slug);
}
