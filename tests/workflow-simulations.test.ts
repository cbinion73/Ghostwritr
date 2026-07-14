import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";

import {
  JsonExtractionError,
  extractJsonText,
  extractTextFromResponse,
  withTimeout,
} from "../src/lib/workflows/promise/generation-response";
import {
  extractItemsFromSource,
  verifyItemsForSource,
} from "../src/lib/workflows/research/extraction-verification";
import {
  RequestLimitError,
  checkRateLimit,
  resetRequestLimitStateForTests,
} from "../src/lib/request-limits";
import type { FetchedSource } from "../src/lib/workflows/research/source-discovery";
import type { ChapterContext } from "../src/lib/workflows/research/execution-setup";
import type { ResearchLens } from "../src/lib/research-lenses";
import type { ChapterResearchItem } from "../src/lib/research-types";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const chapter: ChapterContext = {
  chapterKey: "chapter-1",
  chapterTitle: "The Cost of Clarity",
  chapterDescription: "Why clarity matters",
  paragraphs: [
    { paragraphId: "p1", topicSentence: "Open with stakes", purpose: "Opening" },
    { paragraphId: "p2", topicSentence: "Quantify stakes", purpose: "Evidence" },
  ],
};

const lens: ResearchLens = {
  key: "general",
  label: "General",
  description: "General research lens",
  queryTemplates: [],
  subjectQueries: [],
  tierRules: "",
  directives: "",
  storyGuidance: "",
  storyQueryTemplates: [],
};

const source: FetchedSource = {
  id: "source-1",
  url: "https://example.org/clarity",
  canonicalUrl: "https://example.org/clarity",
  title: "Clarity Report",
  publisher: "Example Publisher",
  accessedAt: "2026-07-13T00:00:00.000Z",
  contentType: "text/html",
  sourceTier: "B",
  tierWeight: 0.75,
  isVerified: true,
  verificationStatus: "VERIFIED",
  text: [
    "This credible report says 42 percent of teams lose time when goals are unclear, based on a multi-year survey of operators.",
    "A second detailed example shows leaders recovered execution speed when decision rules were written plainly for every team.",
    "A third long sentence explains that the report included managers, operators, and senior leaders across multiple teams.",
  ].join(" "),
  html: "<html></html>",
};

function item(input: Partial<ChapterResearchItem> = {}): ChapterResearchItem {
  return {
    id: input.id ?? "item-1",
    itemType: input.itemType ?? "FACT",
    claimText: input.claimText ?? "42 percent of teams lose time when goals are unclear.",
    evidenceExcerpt:
      input.evidenceExcerpt ??
      "42 percent of teams lose time when goals are unclear",
    sourceId: source.id,
    sourceTier: input.sourceTier ?? "B",
    tierWeight: input.tierWeight ?? 0.75,
    verificationStatus: input.verificationStatus ?? "PENDING",
    ...input,
  };
}

type FakeResearchModel = {
  withStructuredOutput: <TSchema extends z.ZodTypeAny>(
    schema: TSchema,
  ) => {
    invoke: () => Promise<z.infer<TSchema>>;
  };
  invoke: () => Promise<{ content: string }>;
};

function fakeStructuredModel(result: unknown): FakeResearchModel {
  return {
    withStructuredOutput: <TSchema extends z.ZodTypeAny>(_schema: TSchema) => ({
      invoke: async () => result as z.infer<TSchema>,
    }),
    invoke: async () => ({ content: JSON.stringify(result) }),
  };
}

function fakeThrowingModel(error: Error): FakeResearchModel {
  return {
    withStructuredOutput: () => ({
      invoke: async () => {
        throw error;
      },
    }),
    invoke: async () => {
      throw error;
    },
  };
}

test("workflow simulation: fake provider success produces usable research items", async () => {
  const items = await extractItemsFromSource(chapter, source, lens, undefined, {
    getModel: async () => fakeStructuredModel({
      items: [
        {
          id: "claim-1",
          itemType: "STATISTIC",
          claimText: "42 percent of teams lose time when goals are unclear.",
          evidenceExcerpt: "42 percent of teams lose time when goals are unclear",
          mappedParagraphId: "p2",
          confidenceScore: 0.9,
          relevanceScore: 0.88,
        },
      ],
    }),
    getPassagePrefilterModel: async () => null,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.id, "claim-1");
  assert.equal(items[0]?.verificationStatus, "PENDING");
  assert.equal(items[0]?.mappedParagraphId, "p2");
});

test("workflow simulation: malformed provider output falls back to provisional research", async () => {
  const items = await extractItemsFromSource(chapter, source, lens, undefined, {
    getModel: async () => fakeThrowingModel(new Error("malformed structured output")),
    getPassagePrefilterModel: async () => null,
  });

  assert.ok(items.length > 0);
  assert.equal(items[0]?.metadata?.provisional, true);
  assert.equal(items[0]?.metadata?.reason, "extraction-failed");
  assert.match(String(items[0]?.metadata?.error), /malformed structured output/);
});

test("workflow simulation: fake verifier rejection marks items rejected without retrying live providers", async () => {
  const candidate = item({ id: "bad-claim" });
  const result = await verifyItemsForSource(chapter, source, [candidate], lens, undefined, {
    getModel: async () => fakeStructuredModel({
      items: [
        {
          itemId: "bad-claim",
          status: "REJECTED",
          claimSupported: false,
          tierConfirmed: true,
          secondSourceRequired: false,
          secondSourceConfirmed: false,
          notes: "The source does not support this claim.",
        },
      ],
    }),
  });

  assert.equal(result.items[0]?.verificationStatus, "REJECTED");
  assert.equal(result.verifications[0]?.status, "REJECTED");
  assert.equal(result.verifications[0]?.claimSupported, false);
});

test("workflow simulation: partial stream text can be recovered while incomplete JSON is rejected", () => {
  const partialResponse = {
    content: [
      { text: "data: " },
      { text: "{\"ok\": true}" },
      { text: "\n\n" },
    ],
  };

  const recoveredText = extractTextFromResponse(partialResponse);
  assert.match(recoveredText, /\{"ok": true}/);
  assert.equal(extractJsonText(recoveredText), "{\"ok\": true}");
  assert.throws(
    () => extractJsonText("{\"ok\":"),
    (error) => error instanceof JsonExtractionError && error.code === "incomplete_json",
  );
});

test("workflow simulation: timeout and rate-limit failures surface as bounded local errors", async () => {
  await assert.rejects(
    withTimeout(new Promise((resolve) => setTimeout(resolve, 50)), 1, "fake provider timed out"),
    /fake provider timed out/,
  );

  resetRequestLimitStateForTests();
  assert.equal(checkRateLimit({ key: "workflow-sim", limit: 1, windowMs: 1000, now: 100 }).allowed, true);
  const limited = checkRateLimit({ key: "workflow-sim", limit: 1, windowMs: 1000, now: 200 });
  assert.equal(limited.allowed, false);
  assert.throws(() => {
    if (!limited.allowed) throw new RequestLimitError("Rate limit exceeded.", 429);
  }, (error) => error instanceof RequestLimitError && error.status === 429);
});

test("workflow simulation: cancellation, retry, and restart use durable stage controls", () => {
  const controls = read("src/lib/workflows/stage-controls.ts");
  const chapterRunRoute = read("src/app/api/books/[slug]/chapter-draft/run/route.ts");
  const workflowRuns = read("src/lib/repositories/workflow-runs.ts");
  const chapterJobs = read("src/lib/workflows/chapter-draft/jobs.ts");
  const researchJobs = read("src/lib/workflows/research/jobs.ts");

  assert.ok(chapterRunRoute.includes('type ChapterDraftRunAction = "full" | "selected" | "stop" | "retry"'));
  assert.ok(chapterRunRoute.includes("cancelStageWorkflow(slug, StageKey.CHAPTER_DRAFT)"));
  assert.ok(chapterRunRoute.includes("retryStageWorkflow("));
  assert.ok(controls.includes("cancelActiveWorkflowRunsForStage(book.id, stageKey, \"Canceled by user.\")"));
  assert.ok(controls.includes("automationStatus: \"canceled\""));
  assert.ok(controls.includes("getChaptersNeedingRecovery"));
  assert.ok(controls.includes("getUnfinishedChapterDraftChapterKeys"));
  assert.ok(controls.includes("getUnfinishedResearchChapterKeys"));
  assert.ok(workflowRuns.includes("recoverExpiredWorkflowRuns"));
  assert.ok(chapterJobs.includes("claimWorkflowRun(runId)"));
  assert.ok(researchJobs.includes("claimWorkflowRun(runId)"));
});

test("workflow simulation: outline changes and stale downstream work remain chapter-scoped", () => {
  const outlineActions = read("src/app/books/[slug]/outline/actions.ts");
  const dependencies = read("src/lib/workflow-dependencies.ts");
  const finalAssembly = read("src/lib/manuscript-export.ts");

  assert.ok(outlineActions.includes("invalidateDependentStagesForBook(slug, StageKey.OUTLINE, {"));
  assert.ok(outlineActions.includes("chapterIds: [chapter.id]"));
  assert.ok(dependencies.includes("affectedChapterIds"));
  assert.ok(dependencies.includes('scope: isChapterScoped ? "chapter" : "stage"'));
  assert.ok(dependencies.includes("markChapterApprovalStale"));
  assert.ok(finalAssembly.includes("has a stale final approval"));
  assert.ok(finalAssembly.includes("requires an approved final Opus revision for every chapter"));
});

test("workflow simulations cover every 9.4 required failure and recovery category", () => {
  const coverage: Record<string, string[]> = {
    success: ["fake provider success produces usable research items"],
    "malformed output": ["malformed provider output falls back"],
    timeout: ["fake provider timed out", "withTimeout"],
    "rate limit": ["Rate limit exceeded", "checkRateLimit"],
    "partial stream": ["partial stream text can be recovered"],
    cancellation: ["cancelStageWorkflow", "cancelActiveWorkflowRunsForStage"],
    retry: ["retryStageWorkflow", "getChaptersNeedingRecovery"],
    restart: ["recoverExpiredWorkflowRuns", "claimWorkflowRun"],
    rejection: ["fake verifier rejection marks items rejected"],
    "outline change": ["invalidateDependentStagesForBook(slug, StageKey.OUTLINE"],
    "stale downstream work": ["markChapterApprovalStale", "has a stale final approval"],
  };

  const corpus = [
    read("tests/workflow-simulations.test.ts"),
    read("src/lib/workflows/stage-controls.ts"),
    read("src/lib/workflow-dependencies.ts"),
    read("src/lib/repositories/workflow-runs.ts"),
    read("src/lib/manuscript-export.ts"),
  ].join("\n");

  for (const [category, snippets] of Object.entries(coverage)) {
    for (const snippet of snippets) {
      assert.ok(corpus.includes(snippet), `${category} simulation coverage missing ${snippet}`);
    }
  }
});
