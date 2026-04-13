export type BookPitchExportFormat = "docx" | "markdown" | "html" | "json";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value: string): string {
  let html = escapeHtml(value);

  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return html;
}

function isMarkdownTableDivider(line: string): boolean {
  return /^\|?[\s:-]+\|[\s|:-]*$/.test(line.trim());
}

function tableRowCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => renderInlineMarkdown(cell.trim()));
}

function renderMarkdownTable(lines: string[]): string {
  const usableLines = lines.filter((line) => line.trim().length > 0);
  if (usableLines.length === 0) {
    return "";
  }

  const header = tableRowCells(usableLines[0]);
  const bodyLines = usableLines.slice(1).filter((line) => !isMarkdownTableDivider(line));

  const thead = `<thead><tr>${header
    .map((cell) => `<th>${cell}</th>`)
    .join("")}</tr></thead>`;
  const tbody = bodyLines.length
    ? `<tbody>${bodyLines
        .map(
          (line) =>
            `<tr>${tableRowCells(line)
              .map((cell) => `<td>${cell}</td>`)
              .join("")}</tr>`,
        )
        .join("")}</tbody>`
    : "";

  return `<table>${thead}${tbody}</table>`;
}

function buildScopedStyles(scope: string): string {
  return `
${scope} {
  color: #2d241d;
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  line-height: 1.75;
  font-size: 16px;
}

${scope} h1,
${scope} h2,
${scope} h3 {
  color: #1f3a4d;
  margin: 0;
}

${scope} h1 {
  margin-top: 2.75rem;
  margin-bottom: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(31, 58, 77, 0.18);
  font-size: 1.4rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

${scope} > h1:first-child {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

${scope} h2 {
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  font-size: 1.05rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

${scope} h3 {
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
}

${scope} p {
  margin: 0 0 1rem;
}

${scope} ul,
${scope} ol {
  margin: 0 0 1rem 1.25rem;
  padding: 0;
}

${scope} li {
  margin-bottom: 0.45rem;
}

${scope} hr {
  border: 0;
  border-top: 1px solid rgba(31, 58, 77, 0.18);
  margin: 2rem 0;
}

${scope} table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.25rem 0 1.5rem;
  font-size: 0.95rem;
}

${scope} th,
${scope} td {
  border: 1px solid rgba(31, 58, 77, 0.18);
  padding: 0.7rem 0.8rem;
  text-align: left;
  vertical-align: top;
}

${scope} th {
  background: rgba(31, 58, 77, 0.08);
  font-weight: 700;
}

${scope} strong {
  color: #1f3a4d;
}

${scope} code {
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 0.92em;
  background: rgba(31, 58, 77, 0.08);
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
}

${scope} a {
  color: #1f3a4d;
}
`;
}

export function renderBookPitchMarkdownToHtml(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const html: string[] = [];
  let paragraphLines: string[] = [];
  let tableLines: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length === 0) {
      return;
    }

    html.push(`<p>${renderInlineMarkdown(paragraphLines.join(" "))}</p>`);
    paragraphLines = [];
  };

  const flushList = () => {
    if (!listType || listItems.length === 0) {
      listType = null;
      listItems = [];
      return;
    }

    html.push(
      `<${listType}>${listItems.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${listType}>`,
    );
    listType = null;
    listItems = [];
  };

  const flushTable = () => {
    if (tableLines.length === 0) {
      return;
    }

    html.push(renderMarkdownTable(tableLines));
    tableLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("|") && trimmed.includes("|")) {
      flushParagraph();
      flushList();
      tableLines.push(trimmed);
      continue;
    }

    flushTable();

    if (trimmed.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      flushList();
      html.push("<hr />");
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType = "ol";
      listItems.push(orderedMatch[1].trim());
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (unorderedMatch) {
      flushParagraph();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType = "ul";
      listItems.push(unorderedMatch[1].trim());
      continue;
    }

    flushList();
    paragraphLines.push(trimmed);
  }

  flushTable();
  flushParagraph();
  flushList();

  return html.join("\n");
}

export function buildBookPitchPreviewHtml(markdown: string): string {
  return `<style>${buildScopedStyles(".book-pitch-preview")}</style><div class="book-pitch-preview">${renderBookPitchMarkdownToHtml(markdown)}</div>`;
}

export function buildBookPitchExportHtml(input: {
  title: string;
  subtitle?: string;
  executiveSummary?: string;
  recommendation?: string;
  markdown: string;
}): string {
  const recommendation = input.recommendation?.replace(/_/g, " ") ?? "IN REVIEW";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      @page {
        margin: 0.85in 0.8in 0.95in;
      }

      body {
        margin: 0;
        background: #f4efe6;
        color: #2d241d;
        font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
      }

      .pitch-shell {
        max-width: 8.5in;
        margin: 0 auto;
        background: #fffdf9;
        min-height: 100vh;
      }

      .cover {
        padding: 0.9in 0.8in 0.75in;
        background:
          linear-gradient(180deg, rgba(31, 58, 77, 0.08), rgba(31, 58, 77, 0.02)),
          linear-gradient(135deg, rgba(162, 123, 54, 0.08), transparent 52%);
        border-bottom: 1px solid rgba(31, 58, 77, 0.15);
      }

      .eyebrow {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 0.72rem;
        letter-spacing: 0.28em;
        text-transform: uppercase;
        color: #1f3a4d;
        margin-bottom: 1.75rem;
      }

      .cover h1 {
        margin: 0 0 0.65rem;
        font-size: 2.2rem;
        line-height: 1.12;
        letter-spacing: 0.01em;
        color: #1f3a4d;
      }

      .cover h2 {
        margin: 0 0 1.5rem;
        font-size: 1.1rem;
        line-height: 1.4;
        font-weight: 400;
        color: #6f6256;
      }

      .cover-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
      }

      .cover-card {
        padding: 0.9rem 1rem;
        border: 1px solid rgba(31, 58, 77, 0.15);
        background: rgba(255, 255, 255, 0.72);
      }

      .cover-card-label {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 0.7rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #6f6256;
        margin-bottom: 0.45rem;
      }

      .cover-card-text {
        font-size: 0.95rem;
        line-height: 1.6;
      }

      .proposal {
        padding: 0.75in 0.8in 1in;
      }

      ${buildScopedStyles(".proposal")}

      .proposal h1 {
        page-break-after: avoid;
      }

      .proposal table {
        page-break-inside: avoid;
      }
    </style>
  </head>
  <body>
    <main class="pitch-shell">
      <section class="cover">
        <div class="eyebrow">GHOSTWRITR Book Pitch Package</div>
        <h1>${escapeHtml(input.title)}</h1>
        ${input.subtitle ? `<h2>${escapeHtml(input.subtitle)}</h2>` : ""}
        <div class="cover-grid">
          <div class="cover-card">
            <div class="cover-card-label">Recommendation</div>
            <div class="cover-card-text">${escapeHtml(recommendation)}</div>
          </div>
          <div class="cover-card">
            <div class="cover-card-label">Executive Summary</div>
            <div class="cover-card-text">${escapeHtml(input.executiveSummary ?? "")}</div>
          </div>
        </div>
      </section>
      <article class="proposal">${renderBookPitchMarkdownToHtml(input.markdown)}</article>
    </main>
  </body>
</html>`;
}

export function sanitizeBookPitchFilename(title: string): string {
  const normalized = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "book-pitch-package";
}
