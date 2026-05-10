export type ManuscriptExportFormat = "docx" | "markdown" | "html" | "json";

export type ManuscriptChapterExport = {
  chapterKey: string;
  chapterLabel: string;
  sectionTitle: string;
  wordCount: number;
  reviewSummary?: string | null;
  chapterText: string;
};

export type ManuscriptExportPayload = {
  title: string;
  subtitle?: string | null;
  totalWords: number;
  chapterCount: number;
  draftedChapterCount: number;
  trimSize?: string | null;
  frontMatter?: string[];
  backMatter?: string[];
  chapters: ManuscriptChapterExport[];
};

export type TypesetPlanInput = {
  trimSize?: string | null;
  trimProfile?: string | null;
  title?: string | null;
  subtitle?: string | null;
  frontMatter?: string[];
  backMatter?: string[];
  runningHeads?: string | null;
  chapterOpenerStyle?: string | null;
  tocIncluded?: boolean;
  sectionStartsOnRecto?: boolean;
  signaturePageMultiple?: number | null;
  estimatedSignatureCount?: number | null;
  estimatedBlankPages?: number | null;
  estimatedFrontMatterPages?: number | null;
  estimatedBodyPages?: number | null;
  estimatedBackMatterPages?: number | null;
  estimatedTotalPages?: number | null;
};

export type TypesetLayoutManifest = {
  generatedAt: string;
  title: string;
  trimSize: string | null;
  signaturePageMultiple: number;
  estimatedSignatureCount: number;
  estimatedBlankPages: number;
  estimatedSpineWidthInches: number;
  sectionStartsOnRecto: boolean;
  tocIncluded: boolean;
  frontMatter: Array<{ name: string; kind: "front-matter"; startsOnRecto: boolean }>;
  chapters: Array<{
    chapterKey: string;
    chapterLabel: string;
    sectionTitle: string;
    startsOnRecto: boolean;
    estimatedWordCount: number;
  }>;
  backMatter: Array<{ name: string; kind: "back-matter"; startsOnRecto: boolean }>;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

export function sanitizeManuscriptFilename(title: string) {
  return (title || "manuscript")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildManuscriptMarkdown(input: ManuscriptExportPayload) {
  const parts: string[] = [
    `# ${input.title}`,
    input.subtitle ? `${input.subtitle}\n` : "",
    `Generated manuscript export`,
    "",
    `Total words: ${input.totalWords.toLocaleString()}`,
    `Chapters drafted: ${input.draftedChapterCount}/${input.chapterCount}`,
    input.trimSize ? `Trim size: ${input.trimSize}` : "",
    "",
  ];

  if (input.frontMatter?.length) {
    parts.push("## Front Matter");
    parts.push("");
    for (const item of input.frontMatter) {
      parts.push(`- ${item}`);
    }
    parts.push("");
  }

  for (const chapter of input.chapters) {
    parts.push(`## ${chapter.chapterLabel}`);
    parts.push("");
    parts.push(`Section: ${chapter.sectionTitle}`);
    parts.push("");
    if (chapter.reviewSummary) {
      parts.push(`Editorial note: ${chapter.reviewSummary}`);
      parts.push("");
    }
    parts.push(chapter.chapterText || "_No draft text yet._");
    parts.push("");
  }

  if (input.backMatter?.length) {
    parts.push("## Back Matter");
    parts.push("");
    for (const item of input.backMatter) {
      parts.push(`- ${item}`);
    }
    parts.push("");
  }

  return parts.filter(Boolean).join("\n");
}

export function buildManuscriptHtml(input: ManuscriptExportPayload) {
  const chapterMarkup = input.chapters
    .map(
      (chapter) => `
        <section class="chapter">
          <div class="chapter-meta">${escapeHtml(chapter.sectionTitle)}</div>
          <h2>${escapeHtml(chapter.chapterLabel)}</h2>
          <div class="chapter-stats">${chapter.wordCount.toLocaleString()} words</div>
          ${
            chapter.reviewSummary
              ? `<aside class="review-summary"><strong>Editorial note:</strong> ${escapeHtml(chapter.reviewSummary)}</aside>`
              : ""
          }
          <div class="chapter-body">${renderParagraphs(chapter.chapterText)}</div>
        </section>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      body {
        margin: 0;
        background: #f6f1e8;
        color: #2d241d;
        font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif;
      }
      main {
        max-width: 860px;
        margin: 0 auto;
        padding: 56px 40px 72px;
        background: #fffdf9;
        min-height: 100vh;
      }
      .title-block {
        border-bottom: 1px solid rgba(31, 58, 77, 0.18);
        padding-bottom: 24px;
        margin-bottom: 32px;
      }
      .kicker {
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font-size: 12px;
        color: #7a6452;
        margin-bottom: 10px;
      }
      h1, h2 {
        color: #1f3a4d;
      }
      h1 {
        margin: 0 0 10px;
        font-size: 2.2rem;
      }
      .subtitle {
        margin: 0 0 16px;
        font-size: 1.05rem;
        color: #5c4d40;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        margin-top: 20px;
      }
      .metric {
        border: 1px solid rgba(31, 58, 77, 0.12);
        border-radius: 14px;
        padding: 14px 16px;
        background: #fffaf1;
      }
      .metric-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #7a6452;
        margin-bottom: 6px;
      }
      .metric strong {
        font-size: 1.1rem;
      }
      .matter-block {
        margin-top: 28px;
        padding: 18px 20px;
        border: 1px solid rgba(31, 58, 77, 0.12);
        border-radius: 14px;
        background: #fffaf1;
      }
      .matter-block ul {
        margin: 12px 0 0;
        padding-left: 18px;
      }
      .matter-block li {
        margin-bottom: 8px;
        line-height: 1.7;
      }
      .chapter {
        margin-top: 36px;
        padding-top: 30px;
        border-top: 1px solid rgba(31, 58, 77, 0.14);
      }
      .chapter-meta,
      .chapter-stats {
        font-size: 13px;
        color: #7a6452;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      h2 {
        margin: 10px 0 12px;
        font-size: 1.5rem;
      }
      .review-summary {
        margin: 18px 0;
        padding: 14px 16px;
        border-radius: 12px;
        background: rgba(31, 58, 77, 0.06);
      }
      .chapter-body p {
        line-height: 1.8;
        margin: 0 0 1rem;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="title-block">
        <div class="kicker">Ghostwritr Manuscript Export</div>
        <h1>${escapeHtml(input.title)}</h1>
        ${input.subtitle ? `<p class="subtitle">${escapeHtml(input.subtitle)}</p>` : ""}
        <div class="summary-grid">
          <div class="metric">
            <div class="metric-label">Draft Words</div>
            <strong>${input.totalWords.toLocaleString()}</strong>
          </div>
          <div class="metric">
            <div class="metric-label">Drafted Chapters</div>
            <strong>${input.draftedChapterCount}/${input.chapterCount}</strong>
          </div>
          <div class="metric">
            <div class="metric-label">Export Status</div>
            <strong>${input.draftedChapterCount === input.chapterCount ? "Complete Draft" : "Partial Draft"}</strong>
          </div>
        </div>
        ${
          input.trimSize
            ? `<div class="matter-block"><strong>Production Notes</strong><ul><li>Trim size: ${escapeHtml(
                input.trimSize,
              )}</li></ul></div>`
            : ""
        }
        ${
          input.frontMatter?.length
            ? `<div class="matter-block"><strong>Front Matter</strong><ul>${input.frontMatter
                .map((item) => `<li>${escapeHtml(item)}</li>`)
                .join("")}</ul></div>`
            : ""
        }
      </section>
      ${chapterMarkup}
      ${
        input.backMatter?.length
          ? `<section class="matter-block"><strong>Back Matter</strong><ul>${input.backMatter
              .map((item) => `<li>${escapeHtml(item)}</li>`)
              .join("")}</ul></section>`
          : ""
      }
    </main>
  </body>
</html>`;
}

function slugifySectionLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function renderTypesetSectionBody(items: string[]) {
  return items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
}

function estimateSpineWidth(estimatedPages: number) {
  return Number((Math.max(estimatedPages, 24) * 0.0025).toFixed(3));
}

export function buildTypesetLayoutManifest(
  input: ManuscriptExportPayload,
  plan: TypesetPlanInput = {},
): TypesetLayoutManifest {
  return {
    generatedAt: new Date().toISOString(),
    title: input.title,
    trimSize: plan.trimSize ?? input.trimSize ?? null,
    signaturePageMultiple: plan.signaturePageMultiple ?? 16,
    estimatedSignatureCount: plan.estimatedSignatureCount ?? 0,
    estimatedBlankPages: plan.estimatedBlankPages ?? 0,
    estimatedSpineWidthInches: estimateSpineWidth(plan.estimatedTotalPages ?? 0),
    sectionStartsOnRecto: plan.sectionStartsOnRecto !== false,
    tocIncluded: plan.tocIncluded !== false,
    frontMatter: (plan.frontMatter ?? input.frontMatter ?? []).map((name) => ({
      name,
      kind: "front-matter",
      startsOnRecto: true,
    })),
    chapters: input.chapters.map((chapter) => ({
      chapterKey: chapter.chapterKey,
      chapterLabel: chapter.chapterLabel,
      sectionTitle: chapter.sectionTitle,
      startsOnRecto: plan.sectionStartsOnRecto !== false,
      estimatedWordCount: chapter.wordCount,
    })),
    backMatter: (plan.backMatter ?? input.backMatter ?? []).map((name) => ({
      name,
      kind: "back-matter",
      startsOnRecto: true,
    })),
  };
}

export function buildCoverBrief(input: ManuscriptExportPayload, plan: TypesetPlanInput = {}) {
  const layoutManifest = buildTypesetLayoutManifest(input, plan);
  return {
    generatedAt: new Date().toISOString(),
    title: input.title,
    subtitle: input.subtitle ?? null,
    trimSize: plan.trimSize ?? input.trimSize ?? null,
    estimatedPageCount: plan.estimatedTotalPages ?? null,
    estimatedSpineWidthInches: layoutManifest.estimatedSpineWidthInches,
    frontCoverPromise:
      input.frontMatter?.[0] ??
      "Lead with the title, subtitle, and one clean promise that matches the manuscript's strongest hook.",
    backCoverChecklist: [
      "Summarize the manuscript's transformation or central conflict in 2-3 sharp paragraphs.",
      "Pull 1-2 proof points or dramatic hooks directly from the manuscript body, not from generic copy.",
      "Keep author bio, endorsements, and call to action aligned with the final package audience.",
    ],
  };
}

export function buildDistributionManifest(input: ManuscriptExportPayload, plan: TypesetPlanInput = {}) {
  return {
    generatedAt: new Date().toISOString(),
    title: input.title,
    trimSize: plan.trimSize ?? input.trimSize ?? null,
    ebookReady: true,
    printReady: true,
    audioReady: false,
    requiredChecks: [
      "Interior layout reviewed against final trim and page estimates.",
      "Front matter and back matter confirmed against publishing package plan.",
      "Metadata, pricing, ISBN, and retailer-specific settings still require publisher-side completion.",
    ],
  };
}

export function buildPrintStylesheet(plan: TypesetPlanInput = {}) {
  const trim = plan.trimSize ?? "6 x 9 in";
  const pageSize = trim === "6 x 9 in" ? "6in 9in" : "6in 9in";

  return `@page {
  size: ${pageSize};
  margin: 0.85in 0.8in 0.9in 0.8in;
}

@page chapter {
  size: ${pageSize};
  margin: 1in 0.85in 0.95in 0.85in;
}

body {
  margin: 0;
  color: #1f1a17;
  font-family: "Baskerville", "Iowan Old Style", Georgia, serif;
  background: white;
}

.book {
  width: 100%;
}

.front-matter,
.back-matter,
.chapter,
.front-matter-page,
.back-matter-page {
  break-before: page;
  page-break-before: always;
}

.title-page,
.copyright-page,
.toc-page,
.front-matter-page,
.back-matter-page,
.blank-page {
  break-after: page;
  page-break-after: always;
  min-height: 90vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.blank-page {
  visibility: hidden;
}

.title-page h1 {
  font-size: 28pt;
  margin: 0 0 14pt;
  letter-spacing: 0.01em;
}

.title-page .subtitle {
  font-size: 14pt;
  color: #5f5248;
  margin-bottom: 22pt;
}

.meta-line,
.running-head-note,
.chapter-meta {
  font-size: 9pt;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #6f5d4d;
}

.toc-page ol,
.front-matter ul,
.back-matter ul {
  padding-left: 18pt;
  line-height: 1.7;
}

.chapter {
  page: chapter;
}

.chapter-opener {
  min-height: 22vh;
  padding-top: 12vh;
  margin-bottom: 20pt;
}

.chapter-number {
  font-size: 10pt;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: #6f5d4d;
}

.chapter h2 {
  font-size: 22pt;
  margin: 10pt 0 8pt;
  line-height: 1.1;
}

.chapter-stats {
  font-size: 9pt;
  color: #7c6b5c;
  margin-bottom: 20pt;
}

.review-summary {
  margin: 12pt 0 20pt;
  padding: 12pt 14pt;
  border: 1px solid rgba(31, 26, 23, 0.15);
  background: #f8f4ee;
}

.chapter-body p {
  margin: 0 0 12pt;
  line-height: 1.58;
  orphans: 3;
  widows: 3;
}

.back-matter h3,
.front-matter h3,
.toc-page h3 {
  font-size: 15pt;
  margin-bottom: 12pt;
}

.production-note {
  margin-top: 10pt;
  font-size: 10pt;
  color: #5f5248;
}

.toc-entry {
  display: flex;
  justify-content: space-between;
  gap: 18pt;
}

.matter-role {
  margin-top: 10pt;
  font-size: 9pt;
  color: #6f5d4d;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
`;
}

export function buildTypesetInteriorHtml(
  input: ManuscriptExportPayload,
  plan: TypesetPlanInput = {},
) {
  const stylesheet = buildPrintStylesheet(plan);
  const tocItems = input.chapters
    .map((chapter) => {
      const estimatedPages = Math.max(
        1,
        Math.round(chapter.wordCount / Math.max(180, Math.ceil(chapter.wordCount / 8) || 180)),
      );
      return `<li class="toc-entry"><span>${escapeHtml(chapter.chapterLabel)}</span><span>${escapeHtml(
        chapter.sectionTitle,
      )} • ~${estimatedPages} pp</span></li>`;
    })
    .join("");

  const chapterMarkup = input.chapters
    .map((chapter, index) => {
      const chapterNumber = index + 1;
      return `
        <section class="chapter" id="${slugifySectionLabel(chapter.chapterLabel)}">
          <div class="chapter-opener">
            <div class="chapter-number">Chapter ${chapterNumber}</div>
            <h2>${escapeHtml(chapter.chapterLabel.replace(/^Chapter\s+\d+:\s*/i, ""))}</h2>
            <div class="chapter-meta">${escapeHtml(plan.chapterOpenerStyle ?? "Standard chapter opener")}</div>
          </div>
          <div class="chapter-stats">${chapter.wordCount.toLocaleString()} words • ${escapeHtml(chapter.sectionTitle)}</div>
          ${
            chapter.reviewSummary
              ? `<aside class="review-summary"><strong>Editorial note:</strong> ${escapeHtml(chapter.reviewSummary)}</aside>`
              : ""
          }
          <div class="chapter-body">${renderParagraphs(chapter.chapterText)}</div>
        </section>
      `;
    })
    .join("");

  const frontMatterPages = (plan.frontMatter ?? input.frontMatter ?? [])
    .map(
      (item) => `
        <section class="front-matter-page">
          <div class="meta-line">Front Matter</div>
          <h3>${escapeHtml(item)}</h3>
          <div class="matter-role">Starts on recto</div>
          <p>This placeholder page reserves layout space for ${escapeHtml(item)} in the final production toolchain.</p>
        </section>
      `,
    )
    .join("");

  const backMatterPages = (plan.backMatter ?? input.backMatter ?? [])
    .map(
      (item) => `
        <section class="back-matter-page">
          <div class="meta-line">Back Matter</div>
          <h3>${escapeHtml(item)}</h3>
          <div class="matter-role">Starts on recto</div>
          <p>This placeholder page reserves layout space for ${escapeHtml(item)} in the final production toolchain.</p>
        </section>
      `,
    )
    .join("");

  const blankPageMarkup =
    (plan.estimatedBlankPages ?? 0) > 0
      ? Array.from({ length: plan.estimatedBlankPages ?? 0 }, (_, index) => `
          <section class="blank-page" aria-hidden="true">
            <div>Reserved production blank page ${index + 1}</div>
          </section>
        `).join("")
      : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(input.title)} - Interior Layout</title>
    <style>${stylesheet}</style>
  </head>
  <body>
    <main class="book">
      <section class="title-page">
        <div class="meta-line">GHOSTWRITR Typeset Interior</div>
        <h1>${escapeHtml(input.title)}</h1>
        ${input.subtitle ? `<div class="subtitle">${escapeHtml(input.subtitle)}</div>` : ""}
        <div class="production-note">Trim size: ${escapeHtml(plan.trimSize ?? input.trimSize ?? "Not specified")}</div>
        ${
          plan.trimProfile
            ? `<div class="production-note">Trim profile: ${escapeHtml(plan.trimProfile)}</div>`
            : ""
        }
        ${
          typeof plan.estimatedTotalPages === "number"
            ? `<div class="production-note">Estimated total pages: ${escapeHtml(String(plan.estimatedTotalPages))} (${escapeHtml(
                String(plan.estimatedFrontMatterPages ?? 0),
              )} front, ${escapeHtml(String(plan.estimatedBodyPages ?? 0))} body, ${escapeHtml(
                String(plan.estimatedBackMatterPages ?? 0),
              )} back)</div>`
            : ""
        }
        <div class="production-note">Signature plan: ${escapeHtml(String(plan.estimatedSignatureCount ?? 0))} x ${escapeHtml(
          String(plan.signaturePageMultiple ?? 16),
        )}-page signatures with ${escapeHtml(String(plan.estimatedBlankPages ?? 0))} reserved blank page(s)</div>
        <div class="production-note">Estimated spine width: ${escapeHtml(String(estimateSpineWidth(plan.estimatedTotalPages ?? 0)))} in</div>
        <div class="production-note">Running heads: ${escapeHtml(plan.runningHeads ?? "Defined in layout toolchain")}</div>
      </section>

      <section class="copyright-page">
        <div class="meta-line">Production Placeholder</div>
        <p>This interior package is generated as a print-layout working file for final publishing production.</p>
        <p>Replace this page with final copyright and edition data before publication.</p>
      </section>

      ${
        plan.tocIncluded !== false
          ? `<section class="toc-page">
              <h3>Table of Contents</h3>
              <ol>${tocItems}</ol>
            </section>`
          : ""
      }

      ${
        (plan.frontMatter ?? input.frontMatter ?? []).length
          ? `<section class="front-matter">
              <h3>Front Matter Plan</h3>
              <ul>${renderTypesetSectionBody(plan.frontMatter ?? input.frontMatter ?? [])}</ul>
            </section>${frontMatterPages}`
          : ""
      }

      ${chapterMarkup}

      ${
        (plan.backMatter ?? input.backMatter ?? []).length
          ? `<section class="back-matter">
              <h3>Back Matter Plan</h3>
              <ul>${renderTypesetSectionBody(plan.backMatter ?? input.backMatter ?? [])}</ul>
            </section>${backMatterPages}`
          : ""
      }
      ${blankPageMarkup}
    </main>
  </body>
</html>`;
}
