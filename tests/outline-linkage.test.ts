import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assembleLinkedParagraphOutline,
  assertLinkedOutlinePackage,
  validateLinkedOutlinePackage,
} from "../src/lib/outline-linkage";
import type { BookOutline } from "../src/lib/outline-types";
import type { ParagraphOutline } from "../src/lib/paragraph-outline-types";

function outline(chapterIds = ["chapter-1", "chapter-2"]): BookOutline {
  return {
    workingTitle: "Linked Book",
    overview: "Overview",
    structureRationale: "Rationale",
    readerTransformation: "Transformation",
    targetWordCount: 3000,
    readerJourneyMapping: [],
    wordCountVerification: {
      bookTargetWordCount: 3000,
      sectionWordCountTotal: 3000,
      chapterWordCountTotal: 3000,
      paragraphWordCountTotal: 3000,
      verified: true,
      notes: [],
    },
    sections: [
      {
        id: "section-1",
        number: 1,
        title: "Section One",
        bigIdea: "Big idea",
        description: "Description",
        whyThisSectionExists: "Why",
        whatItCovers: "What",
        howItServesTheLargerStory: "How",
        readerJourneyPhases: ["Current Reality"],
        wordCountTarget: 3000,
        calculationDisplay: "",
        chapters: chapterIds.map((id, index) => ({
          id,
          number: index + 1,
          title: `Chapter ${index + 1}`,
          bigIdea: "Idea",
          description: "Description",
          whyThisChapterExists: "Why",
          coreIdea: "Core",
          whatGetsConveyed: ["Point"],
          storytellingTechnique: "Teaching",
          personasThatResonate: [],
          voiceBlendEmphasis: { primary: "clear", reasoning: "Readable" },
          readerTransformationByEnd: "Changed",
          readerJourneyPhase: "Current Reality",
          wordCountTarget: index === 0 ? 1000 : 2000,
          calculationDisplay: "",
          internalStructureLabel: "Core Flow",
          internalStructure: [],
          openingHook: "Hook",
          closingBridge: "Bridge",
          paragraphs: [],
        })),
      },
    ],
  };
}

function paragraphOutline(chapterIds = ["chapter-1", "chapter-2"]): ParagraphOutline {
  return {
    workingTitle: "Linked Book",
    overview: "Paragraph overview",
    sections: [
      {
        sectionId: "section-1",
        sectionNumber: 1,
        sectionTitle: "Section One",
        sectionDescription: "Description",
        chapters: chapterIds.map((chapterId, index) => ({
          chapterId,
          chapterNumber: index + 1,
          chapterTitle: `Chapter ${index + 1}`,
          chapterDescription: "Description",
          chapterWordCountTarget: index === 0 ? 1000 : 2000,
          calculationDisplay: "",
          structureBlocks: [],
          paragraphs: [
            {
              id: `${chapterId}-p1`,
              number: 1,
              topicSentence: "Topic",
              mainIdea: "Idea",
              purpose: "Purpose",
              contentType: "framework",
              wordCountTarget: index === 0 ? 1000 : 2000,
            },
          ],
        })),
      },
    ],
  };
}

test("outline linkage passes when paragraph plans match stable outline chapter IDs", () => {
  const report = validateLinkedOutlinePackage(outline(), paragraphOutline());

  assert.equal(report.isLinked, true);
  assert.deepEqual(report.outlineChapterIds, ["chapter-1", "chapter-2"]);
  assert.deepEqual(report.paragraphChapterIds, ["chapter-1", "chapter-2"]);
  assert.deepEqual(report.issues, []);
  assert.doesNotThrow(() => assertLinkedOutlinePackage(outline(), paragraphOutline()));
});

test("outline linkage reports missing, orphaned, reordered, and mismatched chapter plans", () => {
  const badParagraphOutline = paragraphOutline(["chapter-2", "orphan"]);
  badParagraphOutline.sections[0]!.chapters[0]!.chapterWordCountTarget = 1500;
  const report = validateLinkedOutlinePackage(outline(), badParagraphOutline);

  assert.equal(report.isLinked, false);
  assert.ok(report.issues.some((issue) => issue.code === "missing-paragraph-plan" && issue.chapterId === "chapter-1"));
  assert.ok(report.issues.some((issue) => issue.code === "orphan-paragraph-plan" && issue.chapterId === "orphan"));
  assert.ok(report.issues.some((issue) => issue.code === "word-count-target-mismatch" && issue.chapterId === "chapter-2"));
});

test("outline linkage reports pure order mismatches when the same chapter IDs are present", () => {
  const report = validateLinkedOutlinePackage(outline(), paragraphOutline(["chapter-2", "chapter-1"]));

  assert.equal(report.isLinked, false);
  assert.ok(report.issues.some((issue) => issue.code === "chapter-order-mismatch"));
});

test("chapter-scoped paragraph edits preserve unaffected chapter plans during reassembly", () => {
  const base = paragraphOutline();
  const editedChapterTwo = {
    ...base.sections[0]!.chapters[1]!,
    paragraphs: [
      {
        ...base.sections[0]!.chapters[1]!.paragraphs[0]!,
        mainIdea: "Edited only chapter two",
        topicSentence: "Edited only chapter two",
      },
    ],
  };
  const orphanPlan = {
    ...base.sections[0]!.chapters[0]!,
    chapterId: "orphan-chapter",
    chapterTitle: "Orphan",
  };

  const assembled = assembleLinkedParagraphOutline(outline(), [
    base.sections[0]!.chapters[0]!,
    editedChapterTwo,
    orphanPlan,
  ]);

  assert.equal(assembled.sections[0]!.chapters.length, 2);
  assert.equal(assembled.sections[0]!.chapters[0]!.chapterId, "chapter-1");
  assert.equal(assembled.sections[0]!.chapters[0]!.paragraphs[0]!.mainIdea, "Idea");
  assert.equal(assembled.sections[0]!.chapters[1]!.chapterId, "chapter-2");
  assert.equal(assembled.sections[0]!.chapters[1]!.paragraphs[0]!.mainIdea, "Edited only chapter two");
  assert.equal(
    assembled.sections[0]!.chapters.some((chapter) => chapter.chapterId === "orphan-chapter"),
    false,
  );
  assert.equal(validateLinkedOutlinePackage(outline(), assembled).isLinked, true);
});

test("outline chapter regenerate action persists the linked paragraph package after one chapter changes", () => {
  const source = readFileSync("src/app/books/[slug]/outline/actions.ts", "utf8");
  assert.ok(source.includes("regenerateChapterBreakdown"));
  assert.ok(source.includes("persistLinkedParagraphOutlineFromChapterArtifacts(book.id)"));
});
