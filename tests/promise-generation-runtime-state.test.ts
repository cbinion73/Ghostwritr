import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_BOOK_SETUP_PROFILE } from "../src/lib/book-setup-types";
import {
  WorkflowState,
  normalizeBookSetupProfile,
  parseArtifactJson,
} from "../src/lib/workflows/promise/generation-runtime-state";

test("Promise runtime JSON parser returns object artifacts and preserves fallback for non-objects", () => {
  const artifact = { messages: [{ role: "user", content: "shape the promise" }] };
  const fallback = { messages: [] };

  assert.equal(parseArtifactJson(artifact, fallback), artifact);
  assert.equal(parseArtifactJson(null, fallback), fallback);
  assert.equal(parseArtifactJson("not-json", fallback), fallback);
});

test("Promise runtime setup-profile normalization merges partial profiles over defaults", () => {
  const normalized = normalizeBookSetupProfile({
    workingTitle: "Lead Through the Fog",
    writerPersona: "plainspoken strategic guide",
  });

  assert.equal(normalized?.workingTitle, "Lead Through the Fog");
  assert.equal(normalized?.writerPersona, "plainspoken strategic guide");
  assert.equal(normalized?.trimSize, DEFAULT_BOOK_SETUP_PROFILE.trimSize);
});

test("Promise runtime setup-profile normalization rejects non-object artifacts", () => {
  assert.equal(normalizeBookSetupProfile(null), null);
  assert.equal(normalizeBookSetupProfile("markdown blob"), null);
});

test("Promise runtime workflow state annotation is available for graph construction", () => {
  assert.equal(typeof WorkflowState, "object");
});
