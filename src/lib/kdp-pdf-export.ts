import { normalizeTypesetPlan, type TypesetPlanInput } from "./typeset-plan";

export async function buildKdpPdfFromHtml(
  html: string,
  planInput: TypesetPlanInput = {},
): Promise<Buffer> {
  const plan = normalizeTypesetPlan(planInput);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      viewport: {
        width: Math.round(plan.trim.widthIn * 96),
        height: Math.round(plan.trim.heightIn * 96),
      },
    });
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      width: `${plan.trim.widthIn}in`,
      height: `${plan.trim.heightIn}in`,
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0in",
        right: "0in",
        bottom: "0in",
        left: "0in",
      },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
