import { StageKey } from "@prisma/client";

import { renderFictionStagePage } from "../fiction-stage-page";

export default function StoryCorePage(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderFictionStagePage(props, StageKey.STORY_CORE);
}
