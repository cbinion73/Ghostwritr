import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = process.cwd();
const SOURCE_ROOTS = ["src/lib", "src/app/api"];

function listSourceFiles(dir: string): string[] {
  const absDir = path.join(REPO_ROOT, dir);
  const entries = readdirSync(absDir);
  return entries.flatMap((entry) => {
    const abs = path.join(absDir, entry);
    const rel = path.relative(REPO_ROOT, abs);
    const stat = statSync(abs);
    if (stat.isDirectory()) return listSourceFiles(rel);
    if (!/\.(ts|tsx)$/.test(entry)) return [];
    return [rel.split(path.sep).join("/")];
  });
}

function scan(pattern: RegExp, options: { allow?: string[] } = {}) {
  const allow = new Set(options.allow ?? []);
  const violations: string[] = [];
  for (const file of SOURCE_ROOTS.flatMap(listSourceFiles)) {
    if (allow.has(file)) continue;
    const text = readFileSync(path.join(REPO_ROOT, file), "utf8");
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const line = text.slice(0, match.index).split("\n").length;
      violations.push(`${file}:${line}: ${match[0]}`);
    }
  }
  return violations;
}

test("provider SDK construction stays behind the LLM provider boundary", () => {
  const violations = scan(
    /(@langchain\/openai|@langchain\/anthropic|@langchain\/google-genai|@google\/generative-ai|@anthropic-ai\/sdk|new\s+ChatOpenAI|new\s+ChatAnthropic|new\s+ChatGoogleGenerativeAI|new\s+GoogleGenerativeAI|new\s+Anthropic|fetch\s*\(\s*[`'"]https:\/\/api\.(?:openai|anthropic))/g,
    { allow: ["src/lib/llm/providers.ts"] },
  );

  assert.deepEqual(violations, []);
});

test("raw model factories and cost logging are only used by gateway/provider internals", () => {
  const directGetModelCalls = scan(/\bgetModel\s*\(/g, {
    allow: ["src/lib/llm/gateway.ts", "src/lib/llm/providers.ts"],
  });
  const directCostLogCalls = scan(/\blogLLMCall\s*\(/g, {
    allow: [
      "src/lib/llm/gateway.ts",
      "src/lib/llm/providers.ts",
      "src/lib/llm/call-context.ts",
      "src/lib/llm/call-log.ts",
    ],
  });

  assert.deepEqual([...directGetModelCalls, ...directCostLogCalls], []);
});

test("direct gateway acquisition is restricted to explicit boundary helpers", () => {
  const violations = scan(/\bacquireLLMGatewayCall\s*\(/g, {
    allow: [
      "src/lib/llm/gateway.ts",
      "src/lib/llm/routing.ts",
      "src/lib/validation/validation-llm.ts",
    ],
  });

  assert.deepEqual(violations, []);
});

test("validation helpers do not masquerade as direct provider utilities", () => {
  const violations = scan(/\bcallOpenAI\b|Raw OpenAI response/g);

  assert.deepEqual(violations, []);
});
