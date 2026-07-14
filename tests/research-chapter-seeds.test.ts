import assert from "node:assert/strict";
import test from "node:test";

import {
  getWorkspaceChapterSeeds,
  isRealChapter,
} from "../src/lib/workflows/research/chapter-seeds";

test("Research chapter seed filter skips structural labels and keeps narrative titles", () => {
  assert.equal(isRealChapter("Chapter 1"), false);
  assert.equal(isRealChapter("Introduction"), false);
  assert.equal(isRealChapter("The Cost of Clarity"), true);
});

test("Research chapter seeds prefer paragraph outline chapters", () => {
  const seeds = getWorkspaceChapterSeeds(
    null,
    {
      workingTitle: "Lead Through the Fog",
      overview: "A practical book.",
      sections: [
        {
          sectionId: "section-1",
          sectionNumber: 1,
          sectionTitle: "Part One",
          sectionDescription: "Opening section",
          chapters: [
            {
              chapterId: "chapter-1",
              chapterNumber: 1,
              chapterTitle: "The Cost of Clarity",
              chapterDescription: "Why clarity matters",
              chapterWordCountTarget: 3000,
              calculationDisplay: "3000 words",
              structureBlocks: [],
              paragraphs: [],
            },
            {
              chapterId: "chapter-placeholder",
              chapterNumber: 2,
              chapterTitle: "Chapter 2",
              chapterDescription: "Placeholder",
              chapterWordCountTarget: 3000,
              calculationDisplay: "3000 words",
              structureBlocks: [],
              paragraphs: [],
            },
          ],
        },
      ],
    },
  );

  assert.deepEqual(seeds, [
    {
      chapterKey: "chapter-1",
      chapterLabel: "Chapter 1: The Cost of Clarity",
      chapterTitle: "The Cost of Clarity",
      sectionTitle: "Part One",
    },
  ]);
});
