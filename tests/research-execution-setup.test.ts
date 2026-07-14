import test from "node:test";
import assert from "node:assert/strict";

import {
  getBaseStoryChapterContext,
  getChapterContext,
} from "../src/lib/workflows/research/execution-setup";

test("Research execution setup prefers paragraph-outline chapter context", () => {
  const context = getChapterContext(
    "chapter-1",
    ({
      workingTitle: "Fallback Outline",
      overview: "High level",
      sections: [
        {
          id: "section-a",
          number: 1,
          title: "High Level Section",
          description: "Fallback",
          chapters: [
            {
              id: "chapter-1",
              number: 1,
              title: "High Level Title",
              description: "High level description",
              targetWordCount: 2500,
              keyPromise: "Promise",
            },
          ],
        },
      ],
    } as never),
    ({
      workingTitle: "Paragraph Outline",
      overview: "Detailed",
      sections: [
        {
          sectionId: "section-1",
          sectionNumber: 1,
          sectionTitle: "Detailed Section",
          sectionDescription: "Detailed",
          chapters: [
            {
              chapterId: "chapter-1",
              chapterNumber: 1,
              chapterTitle: "Detailed Title",
              chapterDescription: "Detailed description",
              chapterWordCountTarget: 3000,
              calculationDisplay: "3000 words",
              structureBlocks: [],
              paragraphs: [
                {
                  id: "p1",
                  paragraphNumber: 1,
                  topicSentence: "The first idea.",
                  purpose: "Open the chapter.",
                  targetWordCount: 120,
                  sourceNeeds: [],
                },
              ],
            },
          ],
        },
      ],
    } as never),
  );

  assert.deepEqual(context, {
    chapterKey: "chapter-1",
    chapterTitle: "Detailed Title",
    chapterDescription: "Detailed description",
    sectionId: "section-1",
    sectionTitle: "Detailed Section",
    paragraphs: [
      {
        paragraphId: "p1",
        topicSentence: "The first idea.",
        purpose: "Open the chapter.",
      },
    ],
  });
});

test("Research execution setup falls back to high-level outline context", () => {
  const context = getChapterContext(
    "chapter-1",
    ({
      workingTitle: "Fallback Outline",
      overview: "High level",
      sections: [
        {
          id: "section-a",
          number: 1,
          title: "High Level Section",
          description: "Fallback",
          chapters: [
            {
              id: "chapter-1",
              number: 1,
              title: "High Level Title",
              description: "High level description",
              targetWordCount: 2500,
              keyPromise: "Promise",
            },
          ],
        },
      ],
    } as never),
    null,
  );

  assert.deepEqual(context, {
    chapterKey: "chapter-1",
    chapterTitle: "High Level Title",
    chapterDescription: "High level description",
    sectionId: "section-a",
    sectionTitle: "High Level Section",
    paragraphs: [],
  });
});

test("Research execution setup maps Base Story guidance into chapter context fields", () => {
  const baseStory = {
    narrativeGuidance: {
      throughLine: "A clear thread carries the book.",
    },
    chapters: [
      {
        chapterKey: "chapter-1",
        chapterPurpose: "Show why clarity matters.",
        guidance: {
          draftingInstruction: "Use the lighthouse image sparingly.",
        },
      },
    ],
  };

  assert.deepEqual(getBaseStoryChapterContext(baseStory as never, "chapter-1"), {
    baseStoryChapterPurpose: "Show why clarity matters.",
    baseStoryChapterThread: "Use the lighthouse image sparingly.",
    baseStoryBookThread: "A clear thread carries the book.",
  });
  assert.equal(getBaseStoryChapterContext(baseStory as never, "missing"), null);
});
