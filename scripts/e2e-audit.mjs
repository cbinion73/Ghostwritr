import fs from "node:fs/promises";
import path from "node:path";

import { chromium } from "playwright";

const BASE_URL = process.env.GHOSTWRITR_BASE_URL ?? "http://127.0.0.1:3000";
const BOOK_SLUG = process.env.GHOSTWRITR_BOOK_SLUG ?? "4-pillars";
const OUTPUT_DIR = path.resolve("test-results/e2e-audit");

const routes = [
  {
    key: "promise",
    path: `/books/${BOOK_SLUG}/promise`,
    expected: ["Promise", "Audience", "Truth", "Transformation", "Market", "Recommendations"],
  },
  {
    key: "outline",
    path: `/books/${BOOK_SLUG}/outline`,
    expected: ["Outline", "Sections", "Chapters"],
  },
  {
    key: "base-story",
    path: `/books/${BOOK_SLUG}/base-story`,
    expected: ["Base Story"],
  },
  {
    key: "research",
    path: `/books/${BOOK_SLUG}/research`,
    expected: ["Research"],
  },
  {
    key: "external-stories",
    path: `/books/${BOOK_SLUG}/external-stories`,
    expected: ["External Stories"],
  },
  {
    key: "personal-stories",
    path: `/books/${BOOK_SLUG}/personal-stories`,
    expected: ["Personal Stories"],
  },
  {
    key: "chapter-draft",
    path: `/books/${BOOK_SLUG}/chapter-draft`,
    expected: ["Chapter Draft"],
  },
  {
    key: "editing",
    path: `/books/${BOOK_SLUG}/editing`,
    expected: ["Editing"],
  },
];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

async function collectPageSummary(page) {
  const headings = await page.locator("h1, h2, h3").allTextContents();
  const buttons = await page.locator("button").allTextContents();
  const text = normalizeText((await page.locator("body").innerText()) ?? "");

  return {
    headings: headings.map(normalizeText).filter(Boolean).slice(0, 30),
    buttons: buttons.map(normalizeText).filter(Boolean).slice(0, 40),
    bodyPreview: text.slice(0, 2000),
  };
}

async function findButtonState(page, label) {
  const locator = page.getByRole("button", { name: label, exact: true });
  const count = await locator.count();
  if (count !== 1) {
    return { present: count > 0, enabled: null };
  }

  return {
    present: true,
    enabled: await locator.isEnabled(),
  };
}

async function waitForAppSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForLoadState("networkidle", { timeout: 10000 });
  } catch {
    // Dev pages may keep network connections open; DOM ready is good enough.
  }
  await page.waitForTimeout(750);
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const browser = await chromium.launch({
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1200 },
  });

  const results = [];

  for (const route of routes) {
    const url = `${BASE_URL}${route.path}`;
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];

    const onConsole = (message) => {
      if (message.type() === "error") {
        const text = message.text();
        if (text.includes("/_next/webpack-hmr") || text.includes("ERR_INVALID_HTTP_RESPONSE")) {
          return;
        }
        consoleErrors.push(text);
      }
    };
    const onPageError = (error) => {
      pageErrors.push(String(error));
    };
    const onRequestFailed = (request) => {
      failedRequests.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`);
    };

    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    page.on("requestfailed", onRequestFailed);

    let status = null;
    let navigationError = null;
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      status = response?.status() ?? null;
      await waitForAppSettled(page);
    } catch (error) {
      navigationError = error instanceof Error ? error.message : String(error);
    }

    const screenshotPath = path.join(OUTPUT_DIR, `${route.key}.png`);
    let summary = {
      headings: [],
      buttons: [],
      bodyPreview: "",
    };

    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      summary = await collectPageSummary(page);
    } catch (error) {
      if (!navigationError) {
        navigationError = error instanceof Error ? error.message : String(error);
      }
    }

    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);

    const missingExpected = route.expected.filter((value) => !summary.bodyPreview.includes(value));
    const actionableFailedRequests = failedRequests.filter(
      (request) => !(request.includes("_rsc=") && request.includes("net::ERR_ABORTED")),
    );
    const buttonStates = {
      commitPromise: route.key === "promise" ? await findButtonState(page, "Commit Promise") : null,
      generateOutline: route.key === "outline" ? await findButtonState(page, "Generate Outline") : null,
      commitOutline: route.key === "outline" ? await findButtonState(page, "Commit Outline") : null,
      generateBaseStory:
        route.key === "base-story" ? await findButtonState(page, "Generate Base Story") : null,
      generateResearch:
        route.key === "research" ? await findButtonState(page, "Generate Full Research") : null,
      generateExternalStories:
        route.key === "external-stories"
          ? await findButtonState(page, "Generate External Stories")
          : null,
      startPersonalStoriesInterview:
        route.key === "personal-stories"
          ? await findButtonState(page, "Start Chapter-Aware Interview")
          : null,
      commitPersonalStories:
        route.key === "personal-stories"
          ? await findButtonState(page, "Commit Encyclopedia")
          : null,
    };

    results.push({
      route: route.key,
      url,
      status,
      navigationError,
      consoleErrors,
      pageErrors,
      failedRequests: actionableFailedRequests,
      ignoredPrefetchAbortCount: failedRequests.length - actionableFailedRequests.length,
      missingExpected,
      buttonStates,
      ...summary,
      screenshotPath,
    });
  }

  await browser.close();
  const reportPath = path.join(OUTPUT_DIR, "report.json");
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));

  const failures = results.filter(
    (result) =>
      result.navigationError ||
      result.pageErrors.length > 0 ||
      result.consoleErrors.length > 0 ||
      result.failedRequests.length > 0 ||
      result.status === null ||
      result.status >= 400,
  );

  console.log(JSON.stringify({ reportPath, failures, results }, null, 2));

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
