import { StageKey } from "@prisma/client";

import { renderFictionStagePage } from "../fiction-stage-page";

export default function ScenePlanPage(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderFictionStagePage(props, StageKey.SCENE_PLAN);
}
