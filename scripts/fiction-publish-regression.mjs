import fs from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright";

const BASE_URL = process.env.GHOSTWRITR_BASE_URL ?? "http://127.0.0.1:3000";
const BOOK_SLUG = process.env.GHOSTWRITR_BOOK_SLUG ?? "fiction-smoke";
const OUTPUT_DIR = path.resolve("test-results/fiction-publish-regression");
const execFile = promisify(execFileCallback);

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function includesAny(haystack, candidates) {
  return candidates.some((candidate) => haystack.includes(candidate));
}

async function waitForAppSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    // dev mode can keep streams open
  }
  await page.waitForTimeout(750);
}

async function screenshot(page, name) {
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function inspectZipEntries(url) {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const tempPath = path.join(os.tmpdir(), `${BOOK_SLUG}-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`);
  await fs.writeFile(tempPath, buffer);
  try {
    const { stdout } = await execFile("unzip", ["-l", tempPath]);
    return { status: response.status, listing: stdout };
  } finally {
    await fs.unlink(tempPath).catch(() => {});
  }
}

async function collectErrors(page, run) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  const onConsole = (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (
        text.includes("/_next/webpack-hmr") ||
        text.includes("ERR_INVALID_HTTP_RESPONSE") ||
        text.includes("ERR_NETWORK_CHANGED")
      ) {
        return;
      }
      consoleErrors.push(text);
    }
  };
  const onPageError = (error) => {
    pageErrors.push(String(error));
  };
  const onRequestFailed = (request) => {
    const text = `${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`;
    if (
      (text.includes("_rsc=") && text.includes("net::ERR_ABORTED")) ||
      text.includes("__nextjs_font/") ||
      text.includes("ERR_NETWORK_CHANGED")
    ) {
      return;
    }
    failedRequests.push(text);
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  try {
    return await run({ consoleErrors, pageErrors, failedRequests });
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
  }
}

async function expectBodyContains(page, values) {
  const body = normalizeText((await page.locator("body").innerText()) ?? "");
  const missing = values.filter((value) => !body.includes(value));
  return {
    body,
    bodyPreview: body.slice(0, 2000),
    missing,
  };
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const results = [];

  const flows = [
    {
      key: "dashboard",
      url: `${BASE_URL}/books/${BOOK_SLUG}/dashboard`,
      expected: ["Story Cockpit", "Open Publish", "Workflow Progress", "Publish Handoff"],
      expectedAny: [["Status: Synced", "Status: Refresh required"]],
    },
    {
      key: "editing",
      url: `${BASE_URL}/books/${BOOK_SLUG}/editing`,
      expected: ["Editing", "Open Publish", "Editorial Readiness Gate", "Draft Quality Rollup", "Revision Queue", "Manuscript History", "Compare Versions", "Editor Memory", "Generate Revision Plan", "Generate Plan Queue", "Run Full Editorial Loop", "RECOMMENDATION blocked"],
    },
    {
      key: "draft",
      url: `${BASE_URL}/books/${BOOK_SLUG}/draft`,
      expected: ["Draft", "Quality Signals", "Story Memory", "Draft Progress", "Repair Weak Chapters", "Rewrite Scene Focus"],
    },
    {
      key: "publish",
      url: `${BASE_URL}/books/${BOOK_SLUG}/publish`,
      expected: [
        "Publish",
        "Publish Package Sync",
        "Refresh Package",
        "Publishing Package",
        "Editorial Gate",
        "Draft Quality Baseline",
        "Front Matter Plan",
        "Back Matter Plan",
        "Format Profiles",
        "Typesetting Plan",
        "Trim profile",
        "Signature plan",
        "Section starts on recto",
        "Estimated total pages",
        "Preflight Checks",
        "Finalize Handoff",
        "Production Deliverables",
        "Export Interior Layout",
        "Recommendation: blocked",
      ],
    },
  ];

  for (const flow of flows) {
    const result = await collectErrors(page, async (errors) => {
      let status = null;
      let navigationError = null;
      try {
        const response = await page.goto(flow.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        status = response?.status() ?? null;
        await waitForAppSettled(page);
      } catch (error) {
        navigationError = error instanceof Error ? error.message : String(error);
      }

      const { body, bodyPreview, missing } = await expectBodyContains(page, flow.expected);
      const missingExpectedAny = (flow.expectedAny ?? []).flatMap((candidates) =>
        includesAny(body, candidates) ? [] : [candidates.join(" | ")],
      );
      const screenshotPath = await screenshot(page, flow.key);

      return {
        route: flow.key,
        url: flow.url,
        status,
        navigationError,
        bodyPreview,
        missingExpected: missing,
        missingExpectedAny,
        screenshotPath,
        ...errors,
      };
    });

    results.push(result);
  }

  const exportChecks = await Promise.all([
    fetch(`${BASE_URL}/api/books/${BOOK_SLUG}/manuscript-export?format=html`).then(async (response) => ({
      format: "html",
      status: response.status,
      body: await response.text(),
    })),
    fetch(`${BASE_URL}/api/books/${BOOK_SLUG}/manuscript-export?format=markdown`).then(async (response) => ({
      format: "markdown",
      status: response.status,
      body: await response.text(),
    })),
    fetch(`${BASE_URL}/api/books/${BOOK_SLUG}/manuscript-export?format=json`).then(async (response) => ({
      format: "json",
      status: response.status,
      body: await response.text(),
    })),
    inspectZipEntries(`${BASE_URL}/api/books/${BOOK_SLUG}/publish-package`).then(async (result) => ({
      format: "publish-package",
      status: result.status,
      body: result.listing,
    })),
    inspectZipEntries(`${BASE_URL}/api/books/${BOOK_SLUG}/typeset-package`).then(async (result) => ({
      format: "typeset-package",
      status: result.status,
      body: result.listing,
    })),
  ]);

  const exportAssertions = exportChecks.map((check) => {
    const normalized = normalizeText(check.body);
    const expected =
      check.format === "html"
        ? ["Ghostwritr Manuscript Export", "Draft Words", "Drafted Chapters", "Chapter 1: The Summons"]
        : check.format === "markdown"
          ? ["# Fiction Smoke", "Generated manuscript export", "Total words: 3,800", "## Chapter 1: The Summons"]
          : check.format === "json"
          ? ['"frontMatter"', '"backMatter"', '"trimSize"']
          : check.format === "publish-package"
              ? [
                  "publish-package.json",
                  "layout-manifest.json",
                  "cover-brief.json",
                  "distribution-manifest.json",
                  `${BOOK_SLUG}.html`,
                ]
              : ["typeset-package.json", "layout-manifest.json", "cover-brief.json", `${BOOK_SLUG}-interior.html`, `${BOOK_SLUG}-print.css`];

    const missing = expected.filter((value) => !normalized.includes(value));
    return {
      format: check.format,
      status: check.status,
      missingExpected: missing,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    bookSlug: BOOK_SLUG,
    pageChecks: results,
    exportChecks: exportAssertions,
  };

  const reportPath = path.join(OUTPUT_DIR, "report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  await browser.close();

  const pageFailures = results.filter(
    (result) =>
      result.navigationError ||
      result.status === null ||
      result.status >= 400 ||
      result.consoleErrors.length > 0 ||
      result.pageErrors.length > 0 ||
      result.failedRequests.length > 0 ||
      result.missingExpected.length > 0 ||
      (result.missingExpectedAny?.length ?? 0) > 0,
  );
  const exportFailures = exportAssertions.filter(
    (result) => result.status >= 400 || result.missingExpected.length > 0,
  );

  console.log(JSON.stringify({ reportPath, pageFailures, exportFailures, report }, null, 2));

  if (pageFailures.length > 0 || exportFailures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
