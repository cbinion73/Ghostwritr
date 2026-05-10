import { PrismaClient, StageKey } from "@prisma/client";

import { assembleManuscriptWorkflow, getEditingWorkspace } from "../src/lib/workflows/editing";
import {
  commitFictionStageWorkflow,
  expandUnderTargetFictionDraftChaptersWorkflow,
  generateFictionDraftChapterWorkflow,
} from "../src/lib/workflows/fiction";
import { cloneBookBySlug, deleteBookBySlug } from "../src/lib/repositories/books";
import { createFictionArtifactVersion } from "../src/lib/repositories/fiction-artifacts";

const prisma = new PrismaClient();

function buildTargetBand(targetWords: number) {
  return {
    minimumWords: Math.max(250, Math.round(targetWords * 0.82)),
    maximumWords: Math.round(targetWords * 1.18),
  };
}

async function main() {
  const clone = await cloneBookBySlug("fiction-smoke", {
    titleWorking: `Length Control Smoke ${Date.now()}`,
  });

  try {
    const scenePlanVersion = await prisma.artifactVersion.findFirstOrThrow({
      where: {
        artifact: {
          bookId: clone.id,
          artifactType: "FICTION_SCENE_PLAN",
        },
        lifecycleState: "COMMITTED",
      },
      orderBy: { versionNumber: "desc" },
    });

    const scenePlan = scenePlanVersion.contentJson as {
      chapters: Array<{ chapterNumber: number; targetWords: number; title: string }>;
    };

    for (const chapter of scenePlan.chapters) {
      await generateFictionDraftChapterWorkflow(clone.slug, chapter.chapterNumber);
    }

    const beforeExpansionVersion = await prisma.artifactVersion.findFirstOrThrow({
      where: {
        artifact: {
          bookId: clone.id,
          artifactType: "FICTION_DRAFT_MANUSCRIPT",
        },
      },
      orderBy: { versionNumber: "desc" },
    });
    const beforeExpansionDraft = beforeExpansionVersion.contentJson as {
      chapters: Array<{ chapterNumber: number; wordCount: number }>;
    };
    const shortestBefore = beforeExpansionDraft.chapters.reduce((shortest, chapter) => {
      if (!shortest || chapter.wordCount < shortest.wordCount) {
        return chapter;
      }
      return shortest;
    }, null as { chapterNumber: number; wordCount: number } | null);
    if (!shortestBefore) {
      throw new Error("Expected generated draft chapters before expansion recovery.");
    }

    const shortenedDraft = structuredClone(beforeExpansionVersion.contentJson as {
      summary: string;
      totalWords: number;
      chapters: Array<{
        chapterNumber: number;
        title: string;
        pointOfView?: string;
        summary: string;
        text: string;
        wordCount: number;
        quality?: { score: number; readiness: string; needsRevision?: boolean; revisionPasses: number; signals: Array<{ label: string; state: string; detail: string }> };
      }>;
    });
    const shortenedChapter = shortenedDraft.chapters.find(
      (chapter) => chapter.chapterNumber === shortestBefore.chapterNumber,
    );
    if (!shortenedChapter) {
      throw new Error(`Unable to find chapter ${shortestBefore.chapterNumber} for recovery setup.`);
    }
    const replacementText =
      "The scene lands, but the prose is still only a sketch. More concrete action, emotion, and setting detail need to be written into the finished chapter.";
    shortenedDraft.totalWords =
      shortenedDraft.totalWords - shortenedChapter.wordCount + replacementText.split(/\s+/).filter(Boolean).length;
    shortenedChapter.text = replacementText;
    shortenedChapter.wordCount = replacementText.split(/\s+/).filter(Boolean).length;
    const forcedShortWordCount = shortenedChapter.wordCount;
    if (shortenedChapter.quality) {
      shortenedChapter.quality.needsRevision = true;
      shortenedChapter.quality.revisionPasses = Math.max(shortenedChapter.quality.revisionPasses, 1);
    }

    await createFictionArtifactVersion({
      bookId: clone.id,
      stageKey: StageKey.FICTION_DRAFT,
      artifactType: "FICTION_DRAFT_MANUSCRIPT",
      title: "Draft",
      summary: `${shortenedDraft.summary} Forced under-target recovery setup.`,
      contentJson: shortenedDraft,
      contentText: JSON.stringify(shortenedDraft, null, 2),
      promptTemplateVersion: "manuscript-length-regression-shortened-v1",
      modelName: "test:harness",
    });

    const expansion = await expandUnderTargetFictionDraftChaptersWorkflow(clone.slug, 1);
    if (expansion.expandedChapterNumbers.length === 0) {
      throw new Error("Expected at least one under-target fiction chapter to be expanded.");
    }

    await commitFictionStageWorkflow(clone.slug, StageKey.FICTION_DRAFT);
    await assembleManuscriptWorkflow(clone.slug);
    const workspace = await getEditingWorkspace(clone.slug);

    const draftVersion = await prisma.artifactVersion.findFirstOrThrow({
      where: {
        artifact: {
          bookId: clone.id,
          artifactType: "FICTION_DRAFT_MANUSCRIPT",
        },
      },
      orderBy: { versionNumber: "desc" },
    });

    const draft = draftVersion.contentJson as {
      chapters: Array<{
        chapterNumber: number;
        title: string;
        wordCount: number;
        quality?: { signals?: Array<{ label: string; state: string; detail: string }> };
      }>;
      totalWords: number;
    };

    const chapterResults = scenePlan.chapters.map((chapter) => {
      const generated = draft.chapters.find((entry) => entry.chapterNumber === chapter.chapterNumber);
      if (!generated) {
        throw new Error(`Draft chapter ${chapter.chapterNumber} was not generated.`);
      }

      const band = buildTargetBand(chapter.targetWords);
      const criticSignal = generated.quality?.signals?.find((signal) => signal.label === "Adversarial critic");
      if (!criticSignal) {
        throw new Error(`Chapter ${chapter.chapterNumber} is missing the adversarial critic quality signal.`);
      }

      return {
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        targetWords: chapter.targetWords,
        actualWords: generated.wordCount,
        minimumWords: band.minimumWords,
        maximumWords: band.maximumWords,
        criticState: criticSignal.state,
      };
    });

    const expandedChapter = draft.chapters.find((chapter) => chapter.chapterNumber === shortestBefore.chapterNumber);
    if (!expandedChapter) {
      throw new Error(`Expanded chapter ${shortestBefore.chapterNumber} could not be found after recovery.`);
    }
    if (expandedChapter.wordCount <= forcedShortWordCount) {
      throw new Error(
        `Expected chapter ${shortestBefore.chapterNumber} to grow after expansion, but it stayed at ${expandedChapter.wordCount} words.`,
      );
    }
    const expandedTarget = scenePlan.chapters.find((chapter) => chapter.chapterNumber === shortestBefore.chapterNumber);
    if (!expandedTarget) {
      throw new Error(`Missing target definition for expanded chapter ${shortestBefore.chapterNumber}.`);
    }
    const expandedBand = buildTargetBand(expandedTarget.targetWords);
    if (expandedChapter.wordCount < expandedBand.minimumWords || expandedChapter.wordCount > expandedBand.maximumWords) {
      throw new Error(
        `Expanded chapter ${shortestBefore.chapterNumber} missed its target band after recovery: ${expandedChapter.wordCount} words vs ${expandedBand.minimumWords}-${expandedBand.maximumWords}.`,
      );
    }

    if (workspace.editorialReadinessGate.recommendation !== "blocked") {
      throw new Error(
        `Expected editorial readiness gate to block an underlength manuscript, got ${workspace.editorialReadinessGate.recommendation}.`,
      );
    }

    const result = {
      clone: clone.slug,
      expansion,
      chapterResults,
      manuscriptWords: draft.totalWords,
      editorialReadinessGate: workspace.editorialReadinessGate,
    };

    console.log(JSON.stringify({ status: "ok", result }, null, 2));
  } finally {
    await deleteBookBySlug(clone.slug);
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
