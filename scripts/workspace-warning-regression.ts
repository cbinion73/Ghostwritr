import { ActorType, ArtifactStatus, ArtifactType, PrismaClient, StageKey } from "@prisma/client";

import { cloneBookBySlug, deleteBookBySlug } from "../src/lib/repositories/books";
import { getExternalStoriesWorkspace } from "../src/lib/workflows/external-stories-public";
import { getResearchWorkspace } from "../src/lib/workflows/research-public";

const db = new PrismaClient();

async function ensureMalformedArtifact(params: {
  bookId: string;
  artifactType: ArtifactType;
  stageKey: StageKey;
  chapterKey: string;
  chapterTitle: string;
  title: string;
}) {
  const { bookId, artifactType, stageKey, chapterKey, chapterTitle, title } = params;
  const stage = await db.bookStage.findFirst({
    where: { bookId, stageKey },
    select: { id: true },
  });

  if (!stage) {
    throw new Error(`Stage ${stageKey} not found for malformed artifact setup.`);
  }

  const artifact = await db.artifact.findFirst({
    where: {
      bookId,
      artifactType,
      title,
    },
    include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
  });

  if (!artifact) {
    const createdArtifact = await db.artifact.create({
      data: {
        bookId,
        stageId: stage.id,
        artifactType,
        title,
        summary: "Malformed regression fixture",
        status: ArtifactStatus.DRAFT,
        metadataJson: {
          chapterKey,
          chapterTitle,
        },
      },
    });

    await db.artifactVersion.create({
      data: {
        artifactId: createdArtifact.id,
        versionNumber: 1,
        lifecycleState: ArtifactStatus.DRAFT,
        contentJson: {
          invalid: true,
          artifactType,
          note: "Regression intentionally corrupted this payload.",
        },
        contentText: "invalid artifact payload",
        summary: "Malformed regression fixture",
        createdByType: ActorType.SYSTEM,
      },
    });

    return;
  }

  const targetVersionId = artifact.committedVersionId ?? artifact.versions[0]?.id ?? null;
  if (!targetVersionId) {
    throw new Error(`No saved ${artifactType} version found to corrupt.`);
  }

  await db.artifactVersion.update({
    where: { id: targetVersionId },
    data: {
      contentJson: {
        invalid: true,
        artifactType,
        note: "Regression intentionally corrupted this payload.",
      },
    },
  });
}

async function main() {
  const clone = await cloneBookBySlug("nonfiction-smoke", {
    titleWorking: `Workspace Warning Regression ${Date.now()}`,
  });

  try {
    const initialResearchWorkspace = await getResearchWorkspace(clone.slug);
    const initialExternalStoriesWorkspace = await getExternalStoriesWorkspace(clone.slug);
    const researchChapter = initialResearchWorkspace.availableChapters[0];
    const externalStoriesChapter = initialExternalStoriesWorkspace.availableChapters[0];

    if (!researchChapter) {
      throw new Error("Research workspace has no available chapter to attach a malformed artifact to.");
    }

    if (!externalStoriesChapter) {
      throw new Error("External Stories workspace has no available chapter to attach a malformed artifact to.");
    }

    await ensureMalformedArtifact({
      bookId: clone.id,
      artifactType: ArtifactType.RESEARCH_PACK,
      stageKey: StageKey.RESEARCH,
      chapterKey: researchChapter.chapterKey,
      chapterTitle: researchChapter.chapterLabel,
      title: `Research Pack: ${researchChapter.chapterKey} - ${researchChapter.chapterLabel}`,
    });
    await ensureMalformedArtifact({
      bookId: clone.id,
      artifactType: ArtifactType.EXTERNAL_STORY_PACK,
      stageKey: StageKey.EXTERNAL_STORIES,
      chapterKey: externalStoriesChapter.chapterKey,
      chapterTitle: externalStoriesChapter.chapterLabel,
      title: `External Stories: ${externalStoriesChapter.chapterKey} - ${externalStoriesChapter.chapterLabel}`,
    });

    const researchWorkspace = await getResearchWorkspace(clone.slug);
    const externalStoriesWorkspace = await getExternalStoriesWorkspace(clone.slug);

    if (researchWorkspace.invalidArtifactWarnings.length === 0) {
      throw new Error("Research workspace did not surface invalid artifact warnings.");
    }

    if (externalStoriesWorkspace.invalidArtifactWarnings.length === 0) {
      throw new Error("External Stories workspace did not surface invalid artifact warnings.");
    }

    if (!researchWorkspace.selectedTab || researchWorkspace.tabs.length === 0) {
      throw new Error("Research workspace did not remain usable after invalid artifact corruption.");
    }

    if (!externalStoriesWorkspace.selectedTab || externalStoriesWorkspace.tabs.length === 0) {
      throw new Error("External Stories workspace did not remain usable after invalid artifact corruption.");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          slug: clone.slug,
          researchWarnings: researchWorkspace.invalidArtifactWarnings,
          externalStoryWarnings: externalStoriesWorkspace.invalidArtifactWarnings,
        },
        null,
        2,
      ),
    );
  } finally {
    await deleteBookBySlug(clone.slug);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
