import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { getResearchDossierModelName } from "../src/lib/workflows/research/persistence";

const root = process.cwd();

test("Research persistence helper owns dossier persistence and model accounting", () => {
  const persistenceSource = readFileSync(
    join(root, "src/lib/workflows/research/persistence.ts"),
    "utf8",
  );
  const monolithSource = readFileSync(
    join(root, "src/lib/workflows/research.ts"),
    "utf8",
  );

  assert.match(
    persistenceSource,
    /export async function persistChapterResearchDossier/,
    "persistence module should own persistChapterResearchDossier",
  );
  assert.match(
    persistenceSource,
    /createResearchPackVersion/,
    "persistence helper should still create research artifact versions",
  );
  assert.match(
    persistenceSource,
    /promptTemplateVersion: "research-v2-depth"/,
    "persistence helper should preserve prompt template version",
  );
  assert.doesNotMatch(
    monolithSource,
    /createResearchPackVersion\(/,
    "research monolith should no longer create research pack versions directly",
  );
});

test("Research persistence model-name accounting preserves all model roles", () => {
  const modelName = getResearchDossierModelName();

  assert.match(modelName, /questions:/);
  assert.match(modelName, /extraction:/);
  assert.match(modelName, /verification:/);
  assert.match(modelName, /adjudication:/);
});
