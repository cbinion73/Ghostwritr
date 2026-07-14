import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (
        entry === "node_modules" ||
        entry === ".next" ||
        entry === ".git" ||
        entry === ".agents" ||
        entry === ".claude"
      ) {
        return [];
      }
      return walk(path);
    }

    return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

function sourceFiles(...dirs: string[]) {
  return dirs.flatMap((dir) => walk(join(root, dir)));
}

test("8.3 duplicate-path inventory tracks remaining workflow monolith facades exactly", () => {
  const files = sourceFiles("src/lib/workflows");
  const monolithImportPattern = /from ["']\.\.\/(promise|editing|chapter-draft|research)["']/g;
  const actual = files.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(monolithImportPattern)].map((match) => ({
      file: relative(root, file),
      monolith: match[1],
    }));
  }).sort((a, b) => a.file.localeCompare(b.file));

  assert.deepEqual(actual, []);
});

test("8.3 duplicate-path guardrail blocks new raw provider construction outside provider boundary", () => {
  const files = sourceFiles("src", "scripts", "prisma");
  const providerConstructionPattern =
    /new\s+(?:ChatOpenAI|ChatAnthropic|ChatGoogleGenerativeAI|GoogleGenerativeAI|Anthropic|OpenAI)\b/g;
  const allowedFiles = new Set([
    "src/lib/llm/providers.ts",
  ]);
  const offenders = files.flatMap((file) => {
    const relativeFile = relative(root, file);
    if (allowedFiles.has(relativeFile)) return [];
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(providerConstructionPattern)].map((match) => ({
      file: relativeFile,
      constructor: match[0],
    }));
  });

  assert.deepEqual(offenders, []);
});

test("8.3 duplicate-path inventory tracks remaining local navigation maps", () => {
  const files = sourceFiles("src/app", "src/lib");
  const duplicateNavigationMapPattern =
    /(const\s+NONFICTION_STAGES\s*:|export\s+const\s+STAGE_LINKS\s*=|const\s+UTILITY_LINKS\s*:)/g;
  const actual = files.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(duplicateNavigationMapPattern)].map((match) => ({
      file: relative(root, file),
      declaration: match[1],
    }));
  }).sort((a, b) => a.file.localeCompare(b.file));

  assert.deepEqual(actual, [
    {
      file: "src/app/books/[slug]/workspace-shell.tsx",
      declaration: "const UTILITY_LINKS:",
    },
  ]);
});
