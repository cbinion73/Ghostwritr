import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const HOST = "127.0.0.1";
const PORT = Number(process.env.GHOSTWRITR_PROD_PORT ?? 3101);
const BASE_URL = `http://${HOST}:${PORT}`;
const OUTPUT_DIR = path.resolve("test-results/production-runtime-smoke");

const pageChecks = [
  {
    key: "library",
    path: "/",
    expected: ["Book Library", "Existing Books", "Publish handoff:"],
  },
  {
    key: "nonfiction-promise",
    path: "/books/nonfiction-smoke/promise",
    expected: ["Promise", "Audience", "Truth", "Transformation"],
  },
  {
    key: "fiction-publish",
    path: "/books/fiction-smoke/publish",
    expected: ["Publish", "Publish Package Sync", "Typesetting Plan"],
  },
];

const apiChecks = [
  {
    key: "nonfiction-archive",
    path: "/api/books/nonfiction-smoke/archive",
    expectedHeaders: {
      "content-type": "application/zip",
      "content-disposition": "archive.zip",
    },
  },
  {
    key: "fiction-publish-package",
    path: "/api/books/fiction-smoke/publish-package",
    expectedHeaders: {
      "content-type": "application/zip",
      "content-disposition": "publish-package.zip",
    },
  },
  {
    key: "fiction-typeset-package",
    path: "/api/books/fiction-smoke/typeset-package",
    expectedHeaders: {
      "content-type": "application/zip",
      "content-disposition": "typeset-package.zip",
    },
  },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(serverLogs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45000) {
    try {
      const response = await fetch(`${BASE_URL}/`, { redirect: "manual" });
      if (response.status < 500) {
        return;
      }
    } catch {}
    await wait(500);
  }

  throw new Error(
    `Production server failed to become ready on ${BASE_URL}.\nRecent logs:\n${serverLogs.slice(-40).join("\n")}`,
  );
}

async function runPageChecks() {
  const results = [];

  for (const entry of pageChecks) {
    const url = `${BASE_URL}${entry.path}`;
    const response = await fetch(url);
    const body = await response.text();
    const normalized = normalizeText(body);
    const missingExpected = entry.expected.filter((value) => !normalized.includes(value));

    results.push({
      key: entry.key,
      url,
      status: response.status,
      missingExpected,
      bodyPreview: normalized.slice(0, 1200),
    });
  }

  return results;
}

async function runApiChecks() {
  const results = [];

  for (const entry of apiChecks) {
    const url = `${BASE_URL}${entry.path}`;
    const response = await fetch(url, { method: "HEAD" });
    const headers = {
      "content-type": response.headers.get("content-type") ?? "",
      "content-disposition": response.headers.get("content-disposition") ?? "",
    };

    const missingExpected = Object.entries(entry.expectedHeaders)
      .filter(([header, needle]) => !headers[header]?.includes(needle))
      .map(([header, needle]) => `${header}:${needle}`);

    results.push({
      key: entry.key,
      url,
      status: response.status,
      headers,
      missingExpected,
    });
  }

  return results;
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const serverLogs = [];
  const server = spawn(
    "npm",
    ["run", "start", "--", "--hostname", HOST, "--port", String(PORT)],
    {
      cwd: process.cwd(),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const capture = (chunk) => {
    const lines = String(chunk)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    serverLogs.push(...lines);
  };

  server.stdout.on("data", capture);
  server.stderr.on("data", capture);

  let pageResults = [];
  let apiResults = [];

  try {
    await waitForServer(serverLogs);
    pageResults = await runPageChecks();
    apiResults = await runApiChecks();
  } finally {
    server.kill("SIGTERM");
    await wait(1000);
    if (!server.killed) {
      server.kill("SIGKILL");
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    pageResults,
    apiResults,
    serverLogs: serverLogs.slice(-80),
  };

  const reportPath = path.join(OUTPUT_DIR, "report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  const failures = [
    ...pageResults.filter((result) => result.status >= 400 || result.missingExpected.length > 0),
    ...apiResults.filter((result) => result.status >= 400 || result.missingExpected.length > 0),
  ];

  console.log(JSON.stringify({ reportPath, failures, report }, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
