import type { ManuscriptExportPayload } from "./manuscript-document";
import type { BibliographyReport } from "./workflows/bibliography-generator";
import { normalizeTypesetPlan, type TypesetPlanInput } from "./typeset-plan";

export type TypesetPreflightCheck = {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type TypesetPreflightReport = {
  generatedAt: string;
  status: "pass" | "warn" | "fail";
  checks: TypesetPreflightCheck[];
};

type BuildTypesetPreflightInput = {
  payload: ManuscriptExportPayload;
  plan: TypesetPlanInput;
  bibliography: BibliographyReport;
  interiorHtml: string;
  includedFiles: string[];
  pdfRendered: boolean;
};

function check(name: string, status: TypesetPreflightCheck["status"], detail: string): TypesetPreflightCheck {
  return { name, status, detail };
}

function htmlImageChecks(interiorHtml: string): TypesetPreflightCheck[] {
  const imageTags = interiorHtml.match(/<img\b[^>]*>/gi) ?? [];
  if (imageTags.length === 0) {
    return [check("Image policy", "pass", "No images were found in the typeset interior.")];
  }

  const missingAlt = imageTags.filter((tag) => !/\salt=(["']).*?\1/i.test(tag));
  const possibleLowDpi = imageTags.filter((tag) => !/data-dpi=(["'])(3\d\d|[4-9]\d\d)\1/i.test(tag));
  const checks = [
    check("Image alt text", missingAlt.length === 0 ? "pass" : "warn", `${missingAlt.length}/${imageTags.length} image(s) are missing alt text.`),
    check("Image DPI metadata", possibleLowDpi.length === 0 ? "pass" : "warn", `${possibleLowDpi.length}/${imageTags.length} image(s) lack explicit 300+ DPI metadata.`),
  ];
  return checks;
}

export function buildTypesetPreflightReport(input: BuildTypesetPreflightInput): TypesetPreflightReport {
  const plan = normalizeTypesetPlan(input.plan);
  const checks: TypesetPreflightCheck[] = [];

  checks.push(
    check(
      "Final chapter approvals",
      input.payload.draftedChapterCount === input.payload.chapterCount ? "pass" : "fail",
      `${input.payload.draftedChapterCount}/${input.payload.chapterCount} canonical final chapters are present.`,
    ),
  );

  checks.push(
    check(
      "Bibliography gaps",
      input.bibliography.incompleteCitations.some((gap) => gap.severity === "fail")
        ? "fail"
        : input.bibliography.incompleteCitations.length > 0
          ? "warn"
          : "pass",
      `${input.bibliography.sourceCount} source(s), ${input.bibliography.incompleteCitations.length} incomplete citation warning(s).`,
    ),
  );

  checks.push(
    check(
      "KDP trim profile",
      plan.trim.widthIn > 0 && plan.trim.heightIn > 0 ? "pass" : "fail",
      `${plan.trimSize}; ${plan.trim.widthIn} x ${plan.trim.heightIn} in.`,
    ),
  );

  checks.push(
    check(
      "Mirrored margins and gutter",
      plan.margins.mirrored && plan.margins.insideIn >= plan.margins.outsideIn && plan.margins.gutterIn >= 0.1
        ? "pass"
        : "fail",
      `Inside ${plan.margins.insideIn} in, outside ${plan.margins.outsideIn} in, gutter ${plan.margins.gutterIn} in.`,
    ),
  );

  checks.push(
    check(
      "Font availability",
      ["Baskerville", "Georgia", "Garamond", "Palatino Linotype", "Book Antiqua", "Times New Roman"].includes(plan.typography.bodyFont)
        ? "pass"
        : "warn",
      `${plan.typography.bodyFont} is the selected body font; non-standard fonts must be embedded or substituted before KDP upload.`,
    ),
  );

  checks.push(
    check(
      "Table of contents",
      plan.tocIncluded && input.payload.chapters.length > 0 ? "pass" : "warn",
      plan.tocIncluded
        ? `TOC enabled for ${input.payload.chapters.length} chapter(s).`
        : "TOC is disabled; confirm this is intentional before print upload.",
    ),
  );

  const expectedBlankPages =
    typeof plan.estimatedTotalPages === "number" && plan.estimatedTotalPages > 0
      ? (plan.signaturePageMultiple - (plan.estimatedTotalPages % plan.signaturePageMultiple)) % plan.signaturePageMultiple
      : null;
  checks.push(
    check(
      "Signature and blank-page math",
      expectedBlankPages === null || expectedBlankPages === plan.estimatedBlankPages ? "pass" : "warn",
      expectedBlankPages === null
        ? "No total page estimate is available yet; signature math will be checked after pagination."
        : `Expected ${expectedBlankPages} blank page(s) for ${plan.signaturePageMultiple}-page signatures; plan reserves ${plan.estimatedBlankPages}.`,
    ),
  );

  checks.push(
    check(
      "PDF renderer",
      input.pdfRendered ? "pass" : "fail",
      input.pdfRendered
        ? "Local Chromium rendered the print PDF successfully."
        : "Print PDF was not rendered; ensure Playwright Chromium is installed in the runtime environment.",
    ),
  );

  checks.push(
    check(
      "Package file set",
      ["docx", "pdf", "html", "css", "manifest"].every((kind) =>
        input.includedFiles.some((file) =>
          kind === "manifest"
            ? /manifest\.json$/.test(file)
            : file.toLowerCase().endsWith(kind === "css" ? ".css" : `.${kind}`),
        ),
      )
        ? "pass"
        : "fail",
      `Included files: ${input.includedFiles.join(", ")}`,
    ),
  );

  checks.push(...htmlImageChecks(input.interiorHtml));

  const status = checks.some((item) => item.status === "fail")
    ? "fail"
    : checks.some((item) => item.status === "warn")
      ? "warn"
      : "pass";

  return {
    generatedAt: new Date().toISOString(),
    status,
    checks,
  };
}
