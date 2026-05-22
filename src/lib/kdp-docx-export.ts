/**
 * KDP-ready DOCX generator for GHOSTWRITR manuscripts.
 *
 * Produces a properly formatted Word document suitable for direct upload to
 * Amazon KDP. Follows KDP interior formatting guidelines:
 *   - 6×9 trim, mirrored margins
 *   - Georgia 12pt body, 1.5× line spacing, first-line indent
 *   - Centered page numbers in footer
 *   - Heading 1 for chapter titles, Heading 2 for section headings
 *   - Proper bullet / numbered lists
 *   - "Author's Workbench" sections rendered as bordered callout boxes
 */

import {
  AlignmentType,
  BorderStyle,
  convertInchesToTwip,
  Document,
  Footer,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

// ── Layout constants ──────────────────────────────────────────────────────────
const PAGE_W  = convertInchesToTwip(6);
const PAGE_H  = convertInchesToTwip(9);
const M_TOP   = convertInchesToTwip(0.85);
const M_BOT   = convertInchesToTwip(0.85);
const M_IN    = convertInchesToTwip(0.875); // binding/gutter
const M_OUT   = convertInchesToTwip(0.625);

const F       = "Georgia";         // body font
const SZ      = 24;                // 12pt in half-points
const SZ_SM   = 20;                // 10pt — copyright
const SZ_CH   = 40;                // 20pt — chapter title
const SZ_SEC  = 28;                // 14pt — section heading
const SZ_BOOK = 52;                // 26pt — title page book title
const SZ_SUB  = 32;                // 16pt — title page subtitle
const SZ_WB   = 26;                // 13pt — workbench heading
const LINE    = 360;               // 1.5× line spacing
const SPA     = 120;               // paragraph space-after (twips)
const INDENT  = convertInchesToTwip(0.3); // first-line indent

// Callout box colours (Author's Workbench)
const BOX_FILL   = "F2F1ED";
const BOX_BORDER = "4A4A4A";

// ── Section properties ────────────────────────────────────────────────────────
const PAGE_PROPS = {
  page: {
    size: { width: PAGE_W, height: PAGE_H },
    margin: { top: M_TOP, bottom: M_BOT, left: M_IN, right: M_OUT, gutter: 0 },
  },
};

function makeFooter() {
  return new Footer({
    children: [
      new Paragraph({
        children: [new TextRun({ children: [PageNumber.CURRENT], font: F, size: SZ_SM })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
      }),
    ],
  });
}

// ── Text / paragraph builders ─────────────────────────────────────────────────
function run(
  text: string,
  opts: { bold?: boolean; italics?: boolean; size?: number; allCaps?: boolean } = {},
): TextRun {
  return new TextRun({ text, font: F, size: opts.size ?? SZ, bold: opts.bold, italics: opts.italics, allCaps: opts.allCaps });
}

function blankPara(size = SZ): Paragraph {
  return new Paragraph({ children: [run("", { size })], spacing: { after: 0 } });
}

function pageBreakPara(): Paragraph {
  return new Paragraph({ children: [new PageBreak()], spacing: { after: 0 } });
}

// ── Inline markdown parser ────────────────────────────────────────────────────
// Handles **bold** and *italic* / _italic_ within a run of text.
function parseInline(text: string, baseSize = SZ): TextRun[] {
  const runs: TextRun[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(run(text.slice(last, m.index), { size: baseSize }));
    if (m[1]) runs.push(run(m[1], { bold: true, size: baseSize }));
    else if (m[2] || m[3]) runs.push(run((m[2] ?? m[3])!, { italics: true, size: baseSize }));
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(run(text.slice(last), { size: baseSize }));
  return runs.length ? runs : [run(text, { size: baseSize })];
}

// ── List detection ────────────────────────────────────────────────────────────
// Returns { type: "bullet" | "number" | null, text: string }
function detectList(line: string): { type: "bullet" | "number" | null; text: string } {
  if (/^[-*]\s+/.test(line)) return { type: "bullet", text: line.replace(/^[-*]\s+/, "") };
  if (/^\d+[.)]\s+/.test(line)) return { type: "number", text: line.replace(/^\d+[.)]\s+/, "") };
  return { type: null, text: line };
}

// ── Body paragraph ────────────────────────────────────────────────────────────
function bodyPara(text: string, firstInSection = false, size = SZ): Paragraph {
  return new Paragraph({
    children: parseInline(text, size),
    spacing: { line: LINE, after: SPA },
    indent: firstInSection ? undefined : { firstLine: INDENT },
  });
}

// ── Author's Workbench box ────────────────────────────────────────────────────
// Renders all workbench paragraphs inside a bordered, shaded table cell.
function buildWorkbenchBox(heading: string, paras: Paragraph[]): Table {
  const cellChildren: Paragraph[] = [
    // Workbench heading
    new Paragraph({
      children: [run(heading || "The Author's Workbench", { bold: true, size: SZ_WB })],
      spacing: { after: 200 },
    }),
    ...paras,
  ];

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: convertInchesToTwip(0.2), bottom: convertInchesToTwip(0.2) },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { fill: BOX_FILL, type: ShadingType.CLEAR },
            margins: {
              top:    convertInchesToTwip(0.2),
              bottom: convertInchesToTwip(0.2),
              left:   convertInchesToTwip(0.25),
              right:  convertInchesToTwip(0.25),
            },
            borders: {
              top:    { style: BorderStyle.SINGLE, size: 6, color: BOX_BORDER },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: BOX_BORDER },
              left:   { style: BorderStyle.THICK,  size: 12, color: BOX_BORDER },
              right:  { style: BorderStyle.SINGLE, size: 6, color: BOX_BORDER },
            },
            children: cellChildren,
          }),
        ],
      }),
    ],
  });
}

// ── Chapter block parser ──────────────────────────────────────────────────────
// Returns { bodyItems: (Paragraph | Table)[], workbenchTable?: Table }
function parseChapterContent(text: string): { bodyItems: Array<Paragraph | Table> } {
  // Detect workbench start: --- followed (within 3 lines) by "Author's Workbench"
  // or a heading like ## The Author's Workbench
  const WB_RE = /\n---\n\n(?:#+\s*)?(The Author['']s Workbench[^\n]*)/i;
  const wbMatch = WB_RE.exec(text);

  let bodyText = text;
  let workbenchText = "";
  let workbenchHeading = "The Author's Workbench";

  if (wbMatch) {
    bodyText = text.slice(0, wbMatch.index).trim();
    workbenchHeading = wbMatch[1].trim();
    workbenchText = text.slice(wbMatch.index + wbMatch[0].length).trim();
  } else {
    // Also check for plain "The Author's Workbench" heading without ---
    const plainWB = /^(?:#+\s*)?(The Author['']s Workbench[^\n]*)/im.exec(text);
    if (plainWB) {
      bodyText = text.slice(0, plainWB.index).trim();
      workbenchHeading = plainWB[1].trim();
      workbenchText = text.slice(plainWB.index + plainWB[0].length).trim();
    }
  }

  const bodyItems = renderBlocks(bodyText);

  if (workbenchText) {
    const wbParas = renderBlocks(workbenchText).filter((b): b is Paragraph => b instanceof Paragraph);
    const wbTable = buildWorkbenchBox(workbenchHeading, wbParas);
    bodyItems.push(
      blankPara(),  // spacing before box
      wbTable,
    );
  }

  return { bodyItems };
}

// ── Block renderer ────────────────────────────────────────────────────────────
// Converts a block of markdown-ish prose into an array of Paragraphs.
function renderBlocks(text: string, boxSize = SZ): Array<Paragraph | Table> {
  const items: Array<Paragraph | Table> = [];
  const blocks = text.split(/\n{2,}/);
  let firstInSection = true;

  for (const raw of blocks) {
    const line = raw.trim();
    if (!line) continue;

    // H3 / H2 section heading inside chapter
    if (line.startsWith("### ") || line.startsWith("## ")) {
      const heading = line.replace(/^#{2,3}\s+/, "");
      items.push(new Paragraph({
        children: [run(heading, { bold: true, size: SZ_SEC })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 480, after: 240 },
      }));
      firstInSection = true;
      continue;
    }

    // H1 inside body — treat as section heading
    if (line.startsWith("# ")) {
      const heading = line.slice(2).trim();
      items.push(new Paragraph({
        children: [run(heading, { bold: true, size: SZ_SEC })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 480, after: 240 },
      }));
      firstInSection = true;
      continue;
    }

    // Horizontal rule — small vertical gap
    if (/^[-*_]{3,}$/.test(line)) {
      items.push(blankPara(boxSize));
      continue;
    }

    // Multi-line block: could contain bullet/numbered list items
    const lines = line.split("\n");
    if (lines.length === 1) {
      const det = detectList(line);
      if (det.type === "bullet") {
        items.push(new Paragraph({
          children: parseInline(det.text, boxSize),
          bullet: { level: 0 },
          spacing: { after: 80, line: LINE },
        }));
        firstInSection = false;
        continue;
      }
      if (det.type === "number") {
        items.push(new Paragraph({
          children: parseInline(det.text, boxSize),
          numbering: { reference: "list-numbering", level: 0 },
          spacing: { after: 80, line: LINE },
        }));
        firstInSection = false;
        continue;
      }
    } else {
      // Multi-line block — treat each sub-line individually
      for (const subLine of lines) {
        const sl = subLine.trim();
        if (!sl) continue;
        const det = detectList(sl);
        if (det.type === "bullet") {
          items.push(new Paragraph({
            children: parseInline(det.text, boxSize),
            bullet: { level: 0 },
            spacing: { after: 80, line: LINE },
          }));
          firstInSection = false;
          continue;
        }
        if (det.type === "number") {
          items.push(new Paragraph({
            children: parseInline(det.text, boxSize),
            numbering: { reference: "list-numbering", level: 0 },
            spacing: { after: 80, line: LINE },
          }));
          firstInSection = false;
          continue;
        }
        items.push(bodyPara(sl, firstInSection, boxSize));
        firstInSection = false;
      }
      continue;
    }

    items.push(bodyPara(line, firstInSection, boxSize));
    firstInSection = false;
  }

  return items;
}

// ── Front/back matter parser ──────────────────────────────────────────────────
interface TypesetSections {
  titlePage: string;
  copyrightPage: string;
  dedication: string;
  toc: string;
  acknowledgments: string;
  aboutAuthor: string;
}

function parseTypeset(raw: string): TypesetSections {
  const out: TypesetSections = { titlePage: "", copyrightPage: "", dedication: "", toc: "", acknowledgments: "", aboutAuthor: "" };
  const frontRaw = raw.includes("=== BACK MATTER ===")
    ? raw.split("=== BACK MATTER ===")[0].replace("=== FRONT MATTER ===", "").trim()
    : raw.replace("=== FRONT MATTER ===", "").trim();
  const backRaw = raw.includes("=== BACK MATTER ===")
    ? (raw.split("=== BACK MATTER ===")[1] ?? "").trim() : "";

  const parse = (src: string) => {
    const parts = src.split(/\[([^\]]+)\]/);
    for (let i = 1; i < parts.length; i += 2) {
      const k = (parts[i] ?? "").trim().toUpperCase();
      const v = (parts[i + 1] ?? "").trim();
      if (k === "TITLE PAGE") out.titlePage = v;
      else if (k === "COPYRIGHT PAGE") out.copyrightPage = v;
      else if (k === "DEDICATION") out.dedication = v;
      else if (k === "TABLE OF CONTENTS") out.toc = v;
      else if (k === "ACKNOWLEDGMENTS") out.acknowledgments = v;
      else if (k === "ABOUT THE AUTHOR") out.aboutAuthor = v;
    }
  };
  parse(frontRaw);
  parse(backRaw);
  return out;
}

// ── Front matter builders ─────────────────────────────────────────────────────
function buildTitlePage(title: string, subtitle: string | null | undefined, author: string): Paragraph[] {
  return [
    new Paragraph({ children: [run("")], spacing: { before: convertInchesToTwip(1.5), after: 0 } }),
    new Paragraph({
      children: [run(title, { size: SZ_BOOK, bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
    }),
    ...(subtitle ? [new Paragraph({
      children: [run(subtitle, { size: SZ_SUB, italics: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 960 },
    })] : [new Paragraph({ children: [run("")], spacing: { after: 960 } })]),
    new Paragraph({
      children: [run(author)],
      alignment: AlignmentType.CENTER,
    }),
  ];
}

function buildCopyrightPage(content: string): Paragraph[] {
  if (!content) return [];
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  return [
    new Paragraph({ children: [run("")], spacing: { before: convertInchesToTwip(3.5), after: 0 } }),
    ...lines.map(line => new Paragraph({
      children: [run(line, { size: SZ_SM })],
      spacing: { after: 80 },
    })),
  ];
}

function buildDedicationPage(content: string): Paragraph[] {
  if (!content) return [];
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  return [
    new Paragraph({ children: [run("")], spacing: { before: convertInchesToTwip(1.5), after: 0 } }),
    ...lines.map(line => new Paragraph({
      children: [run(line, { italics: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
    })),
  ];
}

function buildTocPage(chapters: Array<{ title: string }>): Paragraph[] {
  return [
    new Paragraph({
      children: [run("Contents", { size: SZ_CH, bold: true })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: convertInchesToTwip(0.5), after: 480 },
    }),
    ...chapters.map(ch => new Paragraph({
      children: [run(ch.title)],
      spacing: { after: 160 },
    })),
  ];
}

// ── Chapter builder ───────────────────────────────────────────────────────────
function buildChapter(title: string, body: string): Array<Paragraph | Table> {
  const bareTitle = title.replace(/^Chapter\s+\d+:\s*/i, "").trim();
  const numMatch  = title.match(/^(Introduction|Chapter\s+\d+|Closing|Conclusion|Epilogue|Prologue|Foreword|Preface|Afterword)/i);
  const label     = numMatch?.[0] ?? null;

  const header: Array<Paragraph | Table> = [
    pageBreakPara(),
    ...(label ? [new Paragraph({
      children: [run(label.toUpperCase(), { allCaps: true, size: 20 })],
      spacing: { before: convertInchesToTwip(0.75), after: 160 },
    })] : [new Paragraph({ children: [run("")], spacing: { before: convertInchesToTwip(0.75), after: 0 } })]),
    new Paragraph({
      children: [run(bareTitle || title, { size: SZ_CH, bold: true })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 80, after: 480 },
    }),
  ];

  const { bodyItems } = parseChapterContent(body);
  return [...header, ...bodyItems];
}

// ── Back matter section ───────────────────────────────────────────────────────
function buildBackSection(heading: string, content: string): Array<Paragraph | Table> {
  if (!content) return [];
  return [
    pageBreakPara(),
    new Paragraph({
      children: [run(heading, { size: SZ_CH, bold: true })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: convertInchesToTwip(0.5), after: 480 },
    }),
    ...renderBlocks(content),
  ];
}

// ── Main export ───────────────────────────────────────────────────────────────
export interface ManuscriptInput {
  title: string;
  subtitle?: string | null;
  author?: string | null;
  typesetContent: string;
  chapters: Array<{ title: string; body: string }>;
}

export async function buildKdpDocx(input: ManuscriptInput): Promise<Buffer> {
  const { title, subtitle, chapters } = input;
  const ts = parseTypeset(input.typesetContent);

  // Resolve author name from title page content or fallback
  let author = input.author ?? "Author";
  if (ts.titlePage) {
    const tpLines = ts.titlePage.split("\n").map(l => l.trim()).filter(Boolean);
    if (tpLines.length >= 2) author = tpLines[tpLines.length - 1] ?? author;
  }

  const allChildren: Array<Paragraph | Table> = [
    ...buildTitlePage(title, subtitle, author),
    pageBreakPara(),
    ...buildCopyrightPage(ts.copyrightPage),
    pageBreakPara(),
    ...(ts.dedication ? [...buildDedicationPage(ts.dedication), pageBreakPara()] : []),
    ...buildTocPage(chapters),
    ...chapters.flatMap(ch => buildChapter(ch.title, ch.body)),
    ...buildBackSection("Acknowledgments", ts.acknowledgments),
    ...buildBackSection("About the Author", ts.aboutAuthor),
  ];

  const doc = new Document({
    creator: "GHOSTWRITR",
    title,
    description: subtitle ?? "",
    numbering: {
      config: [
        {
          reference: "list-numbering",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: convertInchesToTwip(0.375), hanging: convertInchesToTwip(0.25) } },
                run: { font: F, size: SZ },
              },
            },
          ],
        },
      ],
    },
    styles: {
      default: {
        document: {
          run: { font: F, size: SZ },
          paragraph: { spacing: { line: LINE, after: SPA } },
        },
        heading1: {
          run: { font: F, size: SZ_CH, bold: true, color: "000000" },
          paragraph: { spacing: { before: 0, after: 480 } },
        },
        heading2: {
          run: { font: F, size: SZ_SEC, bold: true, color: "000000" },
          paragraph: { spacing: { before: 480, after: 240 } },
        },
      },
    },
    sections: [
      {
        properties: PAGE_PROPS,
        footers: { default: makeFooter() },
        children: allChildren,
      },
    ],
  });

  return Packer.toBuffer(doc) as Promise<Buffer>;
}
