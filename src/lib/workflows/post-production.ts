import { StageKey } from "@prisma/client";
import { db } from "@/lib/db";
import { getBookStageLinks } from "@/lib/navigation";
import { getAgentForStage } from "@/lib/ui/agent-personas";

export type PostProductionWorkspace = {
  book: {
    id: string;
    slug: string;
    titleWorking: string | null;
    workflowType: import("@prisma/client").BookWorkflowType;
  };
  stage: {
    id: string;
    status: import("@prisma/client").StageStatus;
    committedAt: Date | null;
  } | null;
  stageKey: StageKey;
  stageLabel: string;
  stageRoute: string;
  artifactCount: number;
  committedContent: string | null;
  stageLinks: ReturnType<typeof getBookStageLinks>;
  persona: ReturnType<typeof getAgentForStage>;
};

const STAGE_LABELS: Partial<Record<StageKey, string>> = {
  LAUNCH_LISTING: "Launch Listing",
  PRESS_KIT: "Press Kit",
  SOCIAL_CAMPAIGN: "Social Campaign",
  AUDIO_PREP: "Audio Prep",
  COURSE_DESIGN: "Course Design",
  SPEAKING_KIT: "Speaking Kit",
};

function getStageLabel(stageKey: StageKey): string {
  return STAGE_LABELS[stageKey] ?? stageKey.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function getStageRoute(stageKey: StageKey, slug: string): string {
  const routes: Partial<Record<StageKey, string>> = {
    LAUNCH_LISTING: `/books/${slug}/launch-listing`,
    PRESS_KIT: `/books/${slug}/press-kit`,
    SOCIAL_CAMPAIGN: `/books/${slug}/social-campaign`,
    AUDIO_PREP: `/books/${slug}/audio-prep`,
    COURSE_DESIGN: `/books/${slug}/course-design`,
    SPEAKING_KIT: `/books/${slug}/speaking-kit`,
  };
  return routes[stageKey] ?? `/books/${slug}`;
}

export async function getPostProductionWorkspace(
  slug: string,
  stageKey: StageKey,
): Promise<PostProductionWorkspace> {
  // 1. Fetch book
  const book = await db.book.findUniqueOrThrow({
    where: { slug },
    select: { id: true, slug: true, titleWorking: true, workflowType: true },
  });

  // 2. Fetch stage (may be null)
  const stage = await db.bookStage.findUnique({
    where: { bookId_stageKey: { bookId: book.id, stageKey } },
  });

  // 3. Artifact count
  const artifactCount = await db.artifact.count({
    where: { bookId: book.id, stageId: stage?.id ?? "none" },
  });

  // 4. Committed content
  let committedContent: string | null = null;
  if (stage?.committedArtifactVersionId) {
    const version = await db.artifactVersion.findUnique({
      where: { id: stage.committedArtifactVersionId },
      select: { contentText: true },
    });
    committedContent = version?.contentText ?? null;
  }

  // 5–6. Labels and route
  const stageLabel = getStageLabel(stageKey);
  const stageRoute = getStageRoute(stageKey, slug);

  // 7. Stage links
  const stageLinks = getBookStageLinks(book.workflowType, slug);

  // 8. Persona
  const persona = getAgentForStage(stageKey);

  return {
    book,
    stage: stage
      ? { id: stage.id, status: stage.status, committedAt: stage.committedAt }
      : null,
    stageKey,
    stageLabel,
    stageRoute,
    artifactCount,
    committedContent,
    stageLinks,
    persona,
  };
}
