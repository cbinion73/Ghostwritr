import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Chapter Draft model-call helpers live behind the execution module", () => {
  const monolith = readFileSync("src/lib/workflows/chapter-draft.ts", "utf8");
  const execution = readFileSync("src/lib/workflows/chapter-draft/execution.ts", "utf8");
  const helpers = readFileSync("src/lib/workflows/chapter-draft/model-helpers.ts", "utf8");

  const movedHelpers = [
    "getAuthorModel",
    "getReviewerModel",
    "getVoiceGuardCriticModel",
    "runAdversarialProseCritic",
    "generateDraft",
    "reviewDraft",
    "reviseDraft",
    "tuneDraftToTarget",
    "enforceFinishedBookProse",
  ];

  for (const helper of movedHelpers) {
    assert.equal(
      new RegExp(`(?:async\\s+)?function\\s+${helper}\\b`).test(monolith),
      false,
      `${helper} should not be implemented in the chapter-draft monolith`,
    );
    assert.equal(
      new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${helper}\\b`).test(helpers),
      true,
      `${helper} should be implemented in the model helper module`,
    );
  }

  assert.match(
    execution,
    /from "\.\/model-helpers"/,
    "chapter-draft execution module should consume the extracted model helper module",
  );
  assert.match(
    helpers,
    /getModelForRole\("chapter-draft:author"/,
    "author model acquisition should remain routed through the gateway-backed role resolver",
  );
  assert.match(
    helpers,
    /getModelForRole\("chapter-draft:revise"/,
    "review/revision model acquisition should remain routed through the gateway-backed role resolver",
  );
  assert.match(
    helpers,
    /getModelForRole\("voice-guard:critic"/,
    "adversarial critic model acquisition should remain routed through the gateway-backed role resolver",
  );
});

test("Chapter Draft author generation blocks deterministic prose fallback", () => {
  const helpers = readFileSync("src/lib/workflows/chapter-draft/model-helpers.ts", "utf8");

  assert.doesNotMatch(
    helpers,
    /function\s+fallbackDraft\b/,
    "chapter draft should not keep a deterministic fallback draft builder that can masquerade as manuscript prose",
  );
  assert.doesNotMatch(
    helpers,
    /export async function generateDraft[\s\S]*return\s+fallback;/,
    "author draft generation should not return fallback prose when the model is unavailable or fails",
  );
  assert.match(
    helpers,
    /deterministic chapter fallback prose is blocked/,
    "author draft generation should fail explicitly when Quill cannot produce real prose",
  );
});
