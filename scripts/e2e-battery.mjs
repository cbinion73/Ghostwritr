import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const BASE_URL = process.env.GHOSTWRITR_BASE_URL ?? "http://127.0.0.1:3000";
const OUTPUT_DIR = path.resolve("test-results/e2e-battery");
const REPORT_PATH = path.join(OUTPUT_DIR, "report.json");
const SUMMARY_PATH = path.join(OUTPUT_DIR, "summary.md");

const battery = [
  {
    id: "typecheck",
    category: "static",
    command: ["npm", "run", "check"],
    expected: "TypeScript completes with exit code 0.",
    evidence: [],
  },
  {
    id: "build",
    category: "static",
    command: ["npm", "run", "build"],
    expected: "Webpack production build completes with exit code 0.",
    evidence: [],
  },
  {
    id: "promise-phase2",
    category: "workflow-contract",
    command: ["npm", "run", "qa:promise-phase2"],
    expected: "Promise Phase 2 structured-output regressions pass.",
    evidence: [],
  },
  {
    id: "artifact-contracts",
    category: "workflow-contract",
    command: ["npm", "run", "qa:artifact-contracts"],
    expected: "Artifact schemas and committed fixture contracts stay valid.",
    evidence: [],
  },
  {
    id: "stale-dependencies",
    category: "workflow-contract",
    command: ["npm", "run", "qa:stale-dependencies"],
    expected: "Downstream stale-state propagation and recovery signals pass.",
    evidence: [],
  },
  {
    id: "workspace-warnings",
    category: "resilience",
    command: ["npm", "run", "qa:workspace-warnings"],
    expected: "Malformed workspace artifacts degrade safely with warning surfaces.",
    evidence: [],
  },
  {
    id: "editing-trust",
    category: "editing",
    command: ["npm", "run", "qa:editing-trust"],
    expected: "Editing compare, revision, commit, and publish-sync semantics hold.",
    evidence: [],
  },
  {
    id: "manuscript-length",
    category: "quality-enforcement",
    command: ["npm", "run", "qa:manuscript-length"],
    expected: "Forced-short chapters expand back into target band and underlength manuscripts stay blocked.",
    evidence: [],
  },
  {
    id: "archive",
    category: "data-integrity",
    command: ["npm", "run", "qa:archive"],
    expected: "Archive export/import roundtrip preserves the book state.",
    evidence: [],
  },
  {
    id: "autopilot",
    category: "automation",
    command: ["npm", "run", "qa:autopilot"],
    expected: "Autopilot control modes and recovery flows complete successfully.",
    evidence: [],
  },
  {
    id: "nonfiction-ui",
    category: "playwright",
    command: ["npm", "run", "qa:nonfiction"],
    expected: `Playwright nonfiction surface sweep passes against ${BASE_URL}.`,
    evidence: ["test-results/nonfiction-regression/report.json"],
  },
  {
    id: "fiction-ui",
    category: "playwright",
    command: ["npm", "run", "qa:fiction-publish"],
    expected: `Playwright fiction drafting/editing/publish sweep passes against ${BASE_URL}.`,
    evidence: ["test-results/fiction-publish-regression/report.json"],
  },
  {
    id: "full-system",
    category: "playwright",
    command: ["npm", "run", "qa:full-system"],
    expected: `Full browser/API regression passes against ${BASE_URL}.`,
    evidence: ["test-results/full-system-regression/report.json"],
  },
  {
    id: "prod-runtime",
    category: "production-runtime",
    command: ["npm", "run", "qa:prod-runtime"],
    expected: "Built app boots under next start and production smoke checks pass.",
    evidence: ["test-results/production-runtime-smoke/report.json"],
  },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function renderCommand(command) {
  return command.join(" ");
}

async function runCommand(command) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function buildSummary(results) {
  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;

  const lines = [
    "# End-to-End Battery Summary",
    "",
    `- Generated: ${new Date().toISOString()}`,
    `- Base URL: ${BASE_URL}`,
    `- Passed: ${passed}/${results.length}`,
    `- Failed: ${failed}/${results.length}`,
    "",
    "## Results",
    "",
  ];

  for (const result of results) {
    lines.push(`### ${result.id}`);
    lines.push(`- Category: ${result.category}`);
    lines.push(`- Command: \`${renderCommand(result.command)}\``);
    lines.push(`- Expected: ${result.expected}`);
    lines.push(`- Status: ${result.ok ? "PASS" : `FAIL (exit ${result.exitCode})`}`);
    if (result.evidence.length > 0) {
      lines.push(`- Evidence: ${result.evidence.map((item) => `\`${item}\``).join(", ")}`);
    }
    if (!result.ok) {
      const excerpt = `${result.stdout}\n${result.stderr}`.trim().slice(0, 1500);
      lines.push("- Failure excerpt:");
      lines.push("```text");
      lines.push(excerpt || "(no output)");
      lines.push("```");
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const results = [];
  for (const test of battery) {
    const startedAt = new Date().toISOString();
    const result = await runCommand(test.command);
    results.push({
      ...test,
      ...result,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    results,
  };

  await fs.writeFile(REPORT_PATH, JSON.stringify(payload, null, 2));
  await fs.writeFile(SUMMARY_PATH, buildSummary(results));

  const failures = results.filter((result) => !result.ok);
  if (failures.length > 0) {
    console.error(JSON.stringify({ status: "fail", reportPath: REPORT_PATH, failures: failures.map((item) => item.id) }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ status: "ok", reportPath: REPORT_PATH, summaryPath: SUMMARY_PATH }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
