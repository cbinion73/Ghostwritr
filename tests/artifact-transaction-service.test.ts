import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function listFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((entry) => {
    const relative = join(dir, entry);
    const absolute = join(root, relative);
    return statSync(absolute).isDirectory() ? listFiles(relative) : [relative];
  });
}

test("artifact transaction service centralizes commit, rejection, staleness, and supersession", () => {
  const source = read("src/lib/repositories/artifact-transaction-service.ts");

  for (const symbol of [
    "createArtifactVersionInTransaction",
    "commitArtifactVersionInTransaction",
    "rejectArtifactVersionInTransaction",
    "markArtifactStaleInTransaction",
    "supersedeArtifactHistoryInTransaction",
  ]) {
    assert.ok(source.includes(`export async function ${symbol}`), `missing ${symbol}`);
  }

  assert.ok(source.includes("ArtifactStatus.COMMITTED"));
  assert.ok(source.includes("ArtifactStatus.SUPERSEDED"));
  assert.equal(source.includes(".deleteMany("), false, "artifact service must preserve history");
});

test("legacy prune seam now delegates to preserving supersession service", () => {
  const source = read("src/lib/repositories/artifact-lifecycle.ts");

  assert.ok(source.includes("supersedeArtifactHistoryInTransaction"));
  assert.equal(source.includes("artifactVersion.deleteMany"), false);
  assert.equal(source.includes("artifact.deleteMany"), false);
});

test("application code does not destructively delete artifacts or artifact versions", () => {
  const offenders = ["src/app/api", "src/lib"]
    .flatMap((dir) => listFiles(dir))
    .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"))
    .filter((path) => {
      const source = read(path);
      return /\b(?:db|tx)\.artifact(?:Version)?\.deleteMany\b/.test(source);
    });

  assert.deepEqual(offenders, []);
});

test("core approval routes use central artifact commit service", () => {
  for (const path of [
    "src/app/api/books/[slug]/stage-artifacts/approve/route.ts",
    "src/app/api/books/[slug]/stage-artifacts/commit/route.ts",
    "src/app/api/books/[slug]/chapter-draft/approve-all/route.ts",
    "src/app/api/books/[slug]/editing/approve-all/route.ts",
  ]) {
    assert.ok(read(path).includes("commitArtifactVersionInTransaction"), `${path} bypasses commit service`);
  }
});

test("core chapter save routes use central artifact version creation service", () => {
  for (const path of [
    "src/app/api/books/[slug]/stage-artifacts/save-draft/route.ts",
    "src/app/api/books/[slug]/stage-artifacts/save-dossier/route.ts",
    "src/app/api/books/[slug]/chapter-draft/artifacts/route.ts",
    "src/app/api/books/[slug]/scout-research/save-chapter/route.ts",
    "src/app/api/books/[slug]/chronicle-stories/save-chapter/route.ts",
  ]) {
    assert.ok(read(path).includes("createArtifactVersionInTransaction"), `${path} bypasses version creation service`);
  }
});
