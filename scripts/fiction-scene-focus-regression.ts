import { ArtifactType } from "@prisma/client";

import { cloneBookBySlug, deleteBookBySlug } from "../src/lib/repositories/books";
import { getLatestFictionArtifactVersion } from "../src/lib/repositories/fiction-artifacts";
import { generateFictionDraftChapterWorkflow } from "../src/lib/workflows/fiction";

async function main() {
  const clone = await cloneBookBySlug("fiction-smoke", {
    titleWorking: `Fiction Scene Focus Regression ${Date.now()}`,
  });

  try {
    const initialVersion =
      (await getLatestFictionArtifactVersion(clone.id, ArtifactType.FICTION_DRAFT_MANUSCRIPT))?.versionNumber ?? 0;

    await generateFictionDraftChapterWorkflow(clone.slug, 1);
    const chapterVersion =
      await getLatestFictionArtifactVersion(clone.id, ArtifactType.FICTION_DRAFT_MANUSCRIPT);
    if (!chapterVersion) {
      throw new Error("Expected a fiction draft artifact after drafting a chapter.");
    }

    const chapterDraft = chapterVersion.contentJson as {
      summary?: string;
      chapters?: Array<{ chapterNumber: number; text: string }>;
    };
    const firstChapter = chapterDraft.chapters?.find((chapter) => chapter.chapterNumber === 1);
    if (!firstChapter?.text.trim()) {
      throw new Error("Expected chapter 1 to contain prose after chapter generation.");
    }

    await generateFictionDraftChapterWorkflow(clone.slug, 1, 1);
    const focusedVersion =
      await getLatestFictionArtifactVersion(clone.id, ArtifactType.FICTION_DRAFT_MANUSCRIPT);
    if (!focusedVersion) {
      throw new Error("Expected a fiction draft artifact after scene-focused rewrite.");
    }
    if ((focusedVersion.versionNumber ?? 0) <= Math.max(initialVersion, chapterVersion.versionNumber ?? 0)) {
      throw new Error("Scene-focused rewrite did not create a newer fiction draft artifact version.");
    }

    const focusedDraft = focusedVersion.contentJson as {
      summary?: string;
      chapters?: Array<{ chapterNumber: number; text: string }>;
    };
    if (!focusedDraft.summary?.includes("Scene focus: Chapter 1, Scene 1")) {
      throw new Error("Scene-focused rewrite did not record scene-focus summary metadata.");
    }

    const focusedChapter = focusedDraft.chapters?.find((chapter) => chapter.chapterNumber === 1);
    if (!focusedChapter?.text.trim()) {
      throw new Error("Scene-focused rewrite cleared the chapter prose unexpectedly.");
    }

    console.log(
      JSON.stringify({
        slug: clone.slug,
        initialVersion,
        chapterVersion: chapterVersion.versionNumber ?? 0,
        focusedVersion: focusedVersion.versionNumber ?? 0,
      }),
    );
  } finally {
    await deleteBookBySlug(clone.slug);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
