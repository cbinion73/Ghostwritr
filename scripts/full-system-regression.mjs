import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const BASE_URL = process.env.GHOSTWRITR_BASE_URL ?? "http://127.0.0.1:3000";
const OUTPUT_DIR = path.resolve("test-results/full-system-regression");

const pageMatrix = [
  {
    key: "library",
    url: `${BASE_URL}/`,
    expected: ["Book Library", "Existing Books", "Branch Book", "Progress:", "Automation:", "Publish synced", "Publish handoff:"],
  },
  {
    key: "nonfiction-promise",
    url: `${BASE_URL}/books/nonfiction-smoke/promise`,
    expected: ["Promise", "Audience", "Truth", "Transformation", "Market", "Recommendations"],
  },
  {
    key: "nonfiction-outline",
    url: `${BASE_URL}/books/nonfiction-smoke/outline`,
    expected: ["Outline", "Sections", "Chapters", "Full ToC"],
  },
  {
    key: "nonfiction-base-story",
    url: `${BASE_URL}/books/nonfiction-smoke/base-story`,
    expected: ["Base Story", "Open Dashboard"],
  },
  {
    key: "nonfiction-research",
    url: `${BASE_URL}/books/nonfiction-smoke/research`,
    expected: ["Research", "Regenerate Full Research"],
  },
  {
    key: "nonfiction-external-stories",
    url: `${BASE_URL}/books/nonfiction-smoke/external-stories`,
    expected: ["External Stories", "Regenerate Story Vault"],
  },
  {
    key: "nonfiction-personal-stories",
    url: `${BASE_URL}/books/nonfiction-smoke/personal-stories`,
    expected: ["Personal Stories", "Chapter-Aware Interview"],
  },
  {
    key: "nonfiction-chapter-draft",
    url: `${BASE_URL}/books/nonfiction-smoke/chapter-draft`,
    expected: ["Chapter Draft", "Open Publish", "Draft Quality", "QUALITY SIGNALS"],
  },
  {
    key: "nonfiction-dashboard",
    url: `${BASE_URL}/books/nonfiction-smoke/dashboard`,
    expected: ["Parallel Progress", "Run To Full Draft", "Workflow Automation", "Publish Handoff"],
    expectedAny: [["Status: Synced", "Status: Refresh required"]],
  },
  {
    key: "nonfiction-editing",
    url: `${BASE_URL}/books/nonfiction-smoke/editing`,
    expected: ["Editing", "Editor Memory", "Revision Queue", "Compare Versions", "Generate Revision Plan", "RECOMMENDATION blocked"],
  },
  {
    key: "nonfiction-publish",
    url: `${BASE_URL}/books/nonfiction-smoke/publish`,
    expected: ["Publish", "Publish Package Sync", "Typesetting Plan", "Preflight Checks", "Export Publish Package", "Export Interior Layout"],
  },
  {
    key: "fiction-story-setup",
    url: `${BASE_URL}/books/fiction-smoke/story-setup`,
    expected: ["Story Setup", "Regenerate", "Commit"],
  },
  {
    key: "fiction-story-core",
    url: `${BASE_URL}/books/fiction-smoke/story-core`,
    expected: ["Story Core", "Regenerate", "Commit"],
  },
  {
    key: "fiction-world-cast",
    url: `${BASE_URL}/books/fiction-smoke/world-cast`,
    expected: ["World & Cast", "Regenerate", "Commit"],
  },
  {
    key: "fiction-plot-blueprint",
    url: `${BASE_URL}/books/fiction-smoke/plot-blueprint`,
    expected: ["Plot Blueprint", "Story Memory", "Open Draft"],
  },
  {
    key: "fiction-scene-plan",
    url: `${BASE_URL}/books/fiction-smoke/scene-plan`,
    expected: ["Scene Plan", "Story Memory", "Open Draft"],
  },
  {
    key: "fiction-draft",
    url: `${BASE_URL}/books/fiction-smoke/draft`,
    expected: ["Draft", "Regenerate", "Story Memory", "Quality Signals", "Rewrite Scene Focus"],
  },
  {
    key: "fiction-dashboard",
    url: `${BASE_URL}/books/fiction-smoke/dashboard`,
    expected: ["Story Cockpit", "Run To Full Draft", "Workflow Progress", "Publish Handoff"],
    expectedAny: [["Status: Synced", "Status: Refresh required"]],
  },
  {
    key: "fiction-editing",
    url: `${BASE_URL}/books/fiction-smoke/editing`,
    expected: ["Editing", "Editor Memory", "Revision Queue", "Compare Versions", "Generate Revision Plan", "RECOMMENDATION blocked"],
  },
  {
    key: "fiction-publish",
    url: `${BASE_URL}/books/fiction-smoke/publish`,
    expected: ["Publish", "Publish Package Sync", "Typesetting Plan", "Preflight Checks", "Export Publish Package", "Export Interior Layout"],
  },
];

const apiMatrix = [
  {
    key: "nonfiction-json-export",
    url: `${BASE_URL}/api/books/nonfiction-smoke/manuscript-export?format=json`,
    expected: ['"title"', '"frontMatter"', '"backMatter"'],
    contentType: "application/json",
  },
  {
    key: "fiction-json-export",
    url: `${BASE_URL}/api/books/fiction-smoke/manuscript-export?format=json`,
    expected: ['"title"', '"frontMatter"', '"backMatter"'],
    contentType: "application/json",
  },
  {
    key: "nonfiction-publish-package",
    url: `${BASE_URL}/api/books/nonfiction-smoke/publish-package`,
    expected: ["application/zip", "publish-package.zip"],
    headerProbe: true,
  },
  {
    key: "nonfiction-archive",
    url: `${BASE_URL}/api/books/nonfiction-smoke/archive`,
    expected: ["application/zip", "archive.zip"],
    headerProbe: true,
  },
  {
    key: "nonfiction-typeset-package",
    url: `${BASE_URL}/api/books/nonfiction-smoke/typeset-package`,
    expected: ["application/zip", "typeset-package.zip"],
    headerProbe: true,
  },
  {
    key: "fiction-publish-package",
    url: `${BASE_URL}/api/books/fiction-smoke/publish-package`,
    expected: ["application/zip", "publish-package.zip"],
    headerProbe: true,
  },
  {
    key: "fiction-archive",
    url: `${BASE_URL}/api/books/fiction-smoke/archive`,
    expected: ["application/zip", "archive.zip"],
    headerProbe: true,
  },
  {
    key: "fiction-typeset-package",
    url: `${BASE_URL}/api/books/fiction-smoke/typeset-package`,
    expected: ["application/zip", "typeset-package.zip"],
    headerProbe: true,
  },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function includesAny(haystack, candidates) {
  return candidates.some((candidate) => haystack.includes(candidate));
}

function isIgnorableConsoleError(text) {
  return (
    text.includes("/_next/webpack-hmr") ||
    text.includes("ERR_INVALID_HTTP_RESPONSE") ||
    text.includes("ERR_NETWORK_CHANGED") ||
    (text.includes("A tree hydrated but some attributes of the server rendered HTML didn't match the client properties.") &&
      text.includes("caret-color"))
  );
}

function isSoftNavigationTimeout(result) {
  return (
    typeof result.navigationError === "string" &&
    result.navigationError.includes("Timeout 30000ms exceeded") &&
    result.missingExpected.length === 0 &&
    result.bodyPreview.length > 0
  );
}

async function waitForAppSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {}
  await page.waitForTimeout(750);
}

async function screenshot(page, name) {
  const filePath = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function collectErrors(page, run) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  const onConsole = (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (isIgnorableConsoleError(text)) {
        return;
      }
      consoleErrors.push(text);
    }
  };
  const onPageError = (error) => pageErrors.push(String(error));
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

async function main() {
  await ensureDir(OUTPUT_DIR);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  const pageChecks = [];
  for (const entry of pageMatrix) {
    const result = await collectErrors(page, async (errors) => {
      let status = null;
      let navigationError = null;
      try {
        const response = await page.goto(entry.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        status = response?.status() ?? null;
        await waitForAppSettled(page);
      } catch (error) {
        navigationError = error instanceof Error ? error.message : String(error);
      }

      const body = normalizeText((await page.locator("body").innerText()) ?? "");
      const missingExpected = entry.expected.filter((value) => !body.includes(value));
      const missingExpectedAny = (entry.expectedAny ?? []).flatMap((candidates) =>
        includesAny(body, candidates) ? [] : [candidates.join(" | ")],
      );
      const screenshotPath = await screenshot(page, entry.key);

      return {
        route: entry.key,
        url: entry.url,
        status,
        navigationError,
        missingExpected,
        missingExpectedAny,
        bodyPreview: body.slice(0, 2200),
        screenshotPath,
        ...errors,
      };
    });

    pageChecks.push(result);
  }

  const apiChecks = await Promise.all(
    apiMatrix.map(async (entry) => {
      const response = await fetch(entry.url);
      const probe = entry.headerProbe
        ? JSON.stringify({
            contentType: response.headers.get("content-type"),
            disposition: response.headers.get("content-disposition"),
          })
        : await response.text();
      const normalized = normalizeText(probe);
      return {
        route: entry.key,
        url: entry.url,
        status: response.status,
        missingExpected: entry.expected.filter((value) => !normalized.includes(value)),
      };
    }),
  );

  await browser.close();

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    pageChecks,
    apiChecks,
  };

  const reportPath = path.join(OUTPUT_DIR, "report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  const pageFailures = pageChecks.filter(
    (result) =>
      (result.navigationError && !isSoftNavigationTimeout(result)) ||
      (result.status == null && !isSoftNavigationTimeout(result)) ||
      result.status >= 400 ||
      result.consoleErrors.length > 0 ||
      result.pageErrors.length > 0 ||
      result.failedRequests.length > 0 ||
      result.missingExpected.length > 0 ||
      (result.missingExpectedAny?.length ?? 0) > 0,
  );
  const apiFailures = apiChecks.filter(
    (result) => result.status >= 400 || result.missingExpected.length > 0,
  );

  console.log(JSON.stringify({ reportPath, pageFailures, apiFailures, report }, null, 2));
  if (pageFailures.length > 0 || apiFailures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
