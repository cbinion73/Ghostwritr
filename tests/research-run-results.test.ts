import test from "node:test";
import assert from "node:assert/strict";

import {
  recordResearchChapterOutcome,
  researchChapterProgressMessage,
  shouldRetryResearchChapterResult,
  type ResearchFailedChapter,
} from "../src/lib/workflows/research/run-results";

test("research run result helpers preserve retry semantics", () => {
  assert.equal(
    shouldRetryResearchChapterResult(
      { dossier: { metadata: { provisional: true, retryRecommended: true } } },
      1,
      2,
    ),
    true,
  );
  assert.equal(
    shouldRetryResearchChapterResult(
      { dossier: { metadata: { provisional: true, retryRecommended: true } } },
      2,
      2,
    ),
    false,
  );
});

test("research run result helpers record provisional timeout as completed and failed", () => {
  const completedChapterKeys: string[] = [];
  const provisionalChapters: string[] = [];
  const failedChapters: ResearchFailedChapter[] = [];

  recordResearchChapterOutcome({
    chapterKey: "chapter-1",
    chapterTitle: "The First Chapter",
    finalResult: {
      dossier: {
        metadata: {
          provisional: true,
          timeout: true,
          failureReason: "Timed out while fetching sources.",
        },
      },
    },
    chapterFailedMessage: null,
    completedChapterKeys,
    provisionalChapters,
    failedChapters,
  });

  assert.deepEqual(completedChapterKeys, ["chapter-1"]);
  assert.deepEqual(provisionalChapters, ["chapter-1"]);
  assert.deepEqual(failedChapters, [
    { chapterKey: "chapter-1", message: "Timed out while fetching sources." },
  ]);
});

test("research run result helpers record hard failures and progress labels", () => {
  const completedChapterKeys: string[] = [];
  const provisionalChapters: string[] = [];
  const failedChapters: ResearchFailedChapter[] = [];

  recordResearchChapterOutcome({
    chapterKey: "chapter-2",
    chapterTitle: "The Second Chapter",
    finalResult: null,
    chapterFailedMessage: "Search failed.",
    completedChapterKeys,
    provisionalChapters,
    failedChapters,
  });

  assert.deepEqual(completedChapterKeys, []);
  assert.deepEqual(failedChapters, [{ chapterKey: "chapter-2", message: "Search failed." }]);
  assert.equal(
    researchChapterProgressMessage({
      chapterKey: "chapter-2",
      chapterTitle: "The Second Chapter",
      failedChapters,
      provisionalChapters,
    }),
    "Failed The Second Chapter",
  );
});
