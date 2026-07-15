/**
 * KDP-ready DOCX generator for GHOSTWRITR manuscripts.
 *
 * Produces a properly formatted Word document suitable for direct upload to
 * Amazon KDP. Follows KDP interior formatting guidelines, driven by the
 * [DESIGN SPEC] block in the TYPESET_PACKAGE artifact.
 *   - Trim size, margins, and font driven by Folio's typeset decisions
 *   - First-line indent on body paragraphs
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
  Header,
  HeadingLevel,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

import { normalizeTypesetPlan, type TypesetPlanInput } from "./typeset-plan";

// Universal first-line indent
const INDENT = convertInchesToTwip(0.3);

// Paragraph space-after (twips) — fixed regardless of font
const SPA = 120;

// ── Design spec types ─────────────────────────────────────────────────────────
interface DesignSpec {
  trimW: number;     // inches
  trimH: number;
  marginTop: number;
  marginBot: number;
  marginIn: number;  // inside/gutter
  marginOut: number;
  gutter: number;
  font: string;
  bodySz: number;    // half-points
  leading: number;   // twips (1pt = 20 twips)
  chapterOpenStyle: "classic" | "minimal" | "number-prominent";
  sectionBreak: string;
}

function parseDesignSpec(raw: string): DesignSpec {
  const get = (key: string) => {
    const m = raw.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
    return m ? m[1].trim() : "";
  };

  // Trim size → dimensions and margins
  const trim = get("Trim") || "6x9";
  type TrimKey = "5x8" | "5.5x8.5" | "6x9" | "7x10";
  const TRIM_TABLE: Record<TrimKey, { w: number; h: number; top: number; bot: number; ins: number; out: number }> = {
    "5x8":     { w: 5,   h: 8,   top: 0.75,  bot: 0.75,  ins: 0.75,  out: 0.5   },
    "5.5x8.5": { w: 5.5, h: 8.5, top: 0.75,  bot: 0.75,  ins: 0.875, out: 0.5   },
    "6x9":     { w: 6,   h: 9,   top: 0.85,  bot: 0.85,  ins: 0.875, out: 0.625 },
    "7x10":    { w: 7,   h: 10,  top: 0.875, bot: 0.875, ins: 0.875, out: 0.625 },
  };
  const t = TRIM_TABLE[trim as TrimKey] ?? TRIM_TABLE["6x9"];

  // Font — map to Word-safe name
  const fontRaw = get("Font") || "Georgia";
  const FONT_MAP: Record<string, string> = {
    "Garamond":          "Garamond",
    "Georgia":           "Georgia",
    "Palatino Linotype": "Palatino Linotype",
    "Book Antiqua":      "Book Antiqua",
    "Times New Roman":   "Times New Roman",
  };
  const font = FONT_MAP[fontRaw] ?? "Georgia";

  // Body size in half-points (23 = 11.5pt, 24 = 12pt)
  const bodyPtRaw = parseFloat(get("BodyPt") || "11.5");
  const bodySz = Math.round(bodyPtRaw * 2);

  // Leading in twips (1pt = 20 twips)
  const leadingPtRaw = parseFloat(get("LeadingPt") || "15");
  const leading = Math.round(leadingPtRaw * 20);

  const chapterOpenStyleRaw = get("ChapterOpenStyle") || "classic";
  const chapterOpenStyle = (
    ["classic", "minimal", "number-prominent"].includes(chapterOpenStyleRaw)
      ? chapterOpenStyleRaw
      : "classic"
  ) as DesignSpec["chapterOpenStyle"];

  const sectionBreakRaw = get("SectionBreak") || "* * *";
  const sectionBreak =
    sectionBreakRaw === "whitespace" ? ""
    : sectionBreakRaw === "rule" ? "———"
    : "* * *";

  return {
    trimW: t.w, trimH: t.h,
    marginTop: t.top, marginBot: t.bot, marginIn: t.ins, marginOut: t.out, gutter: 0,
    font, bodySz, leading, chapterOpenStyle, sectionBreak,
  };
}

function planToDesignSpec(input: TypesetPlanInput): DesignSpec {
  const plan = normalizeTypesetPlan(input);
  return {
    trimW: plan.trim.widthIn,
    trimH: plan.trim.heightIn,
    marginTop: plan.margins.topIn,
    marginBot: plan.margins.bottomIn,
    marginIn: plan.margins.insideIn,
    marginOut: plan.margins.outsideIn,
    gutter: plan.margins.gutterIn,
    font: plan.typography.bodyFont,
    bodySz: Math.round(plan.typography.bodyPointSize * 2),
    leading: Math.round(plan.typography.lineHeightPt * 20),
    chapterOpenStyle: ["classic", "minimal", "number-prominent"].includes(plan.chapterOpenerStyle)
      ? (plan.chapterOpenerStyle as DesignSpec["chapterOpenStyle"])
      : "classic",
    sectionBreak: plan.sectionBreak === "recto" ? "* * *" : "",
  };
}

// ── Front/back matter parser ──────────────────────────────────────────────────
interface TypesetSections {
  designSpec: string;
  titlePage: string;
  copyrightPage: string;
  dedication: string;
  toc: string;
  acknowledgments: string;
  aboutAuthor: string;
}

function parseTypeset(raw: string): TypesetSections {
  const out: TypesetSections = {
    designSpec: "",
    titlePage: "",
    copyrightPage: "",
    dedication: "",
    toc: "",
    acknowledgments: "",
    aboutAuthor: "",
  };

  // Extract design spec block before === FRONT MATTER ===
  const specRaw = raw.includes("=== FRONT MATTER ===")
    ? raw.split("=== FRONT MATTER ===")[0]
    : "";
  const specMatch = specRaw.match(/\[DESIGN SPEC\]([\s\S]*?)(?=\[|$)/);
  out.designSpec = specMatch ? specMatch[1].trim() : "";

  // Parse the rest from front/back matter sections
  const contentRaw = raw.includes("=== FRONT MATTER ===")
    ? raw.slice(raw.indexOf("=== FRONT MATTER ==="))
    : raw;

  const frontRaw = contentRaw.includes("=== BACK MATTER ===")
    ? contentRaw.split("=== BACK MATTER ===")[0].replace("=== FRONT MATTER ===", "").trim()
    : contentRaw.replace("=== FRONT MATTER ===", "").trim();
  const backRaw = contentRaw.includes("=== BACK MATTER ===")
    ? (contentRaw.split("=== BACK MATTER ===")[1] ?? "").trim()
    : "";

  const parse = (src: string) => {
    const parts = src.split(/\[([^\]]+)\]/);
    for (let i = 1; i < parts.length; i += 2) {
      const k = (parts[i] ?? "").trim().toUpperCase();
      const v = (parts[i + 1] ?? "").trim();
      if (k === "TITLE PAGE")        out.titlePage      = v;
      else if (k === "COPYRIGHT PAGE")   out.copyrightPage  = v;
      else if (k === "DEDICATION")       out.dedication     = v;
      else if (k === "TABLE OF CONTENTS") out.toc           = v;
      else if (k === "ACKNOWLEDGMENTS")  out.acknowledgments = v;
      else if (k === "ABOUT THE AUTHOR") out.aboutAuthor    = v;
    }
  };
  parse(frontRaw);
  parse(backRaw);
  return out;
}

// ── Main export ───────────────────────────────────────────────────────────────
export interface ManuscriptInput {
  title: string;
  subtitle?: string | null;
  author?: string | null;
  typesetContent: string;
  typesetPlan?: TypesetPlanInput;
  chapters: Array<{ title: string; body: string }>;
  bibliography?: string[];
  proofNotice?: string | null;
}

export async function buildKdpDocx(input: ManuscriptInput): Promise<Buffer> {
  const { title, subtitle, chapters } = input;
  const ts  = parseTypeset(input.typesetContent);
  const plan = normalizeTypesetPlan({
    ...(input.typesetPlan ?? {}),
    title,
    subtitle: subtitle ?? null,
  });
  const spec = input.typesetPlan ? planToDesignSpec(plan) : parseDesignSpec(ts.designSpec);

  // Layout constants derived from design spec
  const PAGE_W  = convertInchesToTwip(spec.trimW);
  const PAGE_H  = convertInchesToTwip(spec.trimH);
  const M_TOP   = convertInchesToTwip(spec.marginTop);
  const M_BOT   = convertInchesToTwip(spec.marginBot);
  const M_IN    = convertInchesToTwip(spec.marginIn);
  const M_OUT   = convertInchesToTwip(spec.marginOut);
  const M_GUT   = convertInchesToTwip(spec.gutter);
  const F       = spec.font;
  const SZ      = spec.bodySz;
  const SZ_SM   = Math.round(SZ * 0.83);   // ~10pt for 12pt body — copyright
  const SZ_CH   = Math.round(SZ * 1.67);   // ~20pt — chapter title
  const SZ_SEC  = Math.round(SZ * 1.17);   // ~14pt — section heading
  const SZ_BOOK = Math.round(SZ * 2.17);   // ~26pt — title page book title
  const SZ_SUB  = Math.round(SZ * 1.33);   // ~16pt — title page subtitle
  const LINE    = spec.leading;

  // ── Section properties ──────────────────────────────────────────────────────
  const PAGE_PROPS = {
    page: {
      size: { width: PAGE_W, height: PAGE_H },
      margin: { top: M_TOP, bottom: M_BOT, left: M_IN, right: M_OUT, gutter: M_GUT },
    },
  };

  // ── Header ──────────────────────────────────────────────────────────────────
  function makeHeader() {
    return new Header({
      children: [
        new Paragraph({
          children: [new TextRun({ text: plan.runningHeads, font: F, size: SZ_SM })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 0 },
        }),
      ],
    });
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
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

  // ── Text / paragraph builders ───────────────────────────────────────────────
  function run(
    text: string,
    opts: { bold?: boolean; italics?: boolean; size?: number; allCaps?: boolean } = {},
  ): TextRun {
    return new TextRun({
      text,
      font: F,
      size: opts.size ?? SZ,
      bold: opts.bold,
      italics: opts.italics,
      allCaps: opts.allCaps,
    });
  }

  function blankPara(size = SZ): Paragraph {
    return new Paragraph({ children: [run("", { size })], spacing: { after: 0 } });
  }

  function pageBreakPara(): Paragraph {
    return new Paragraph({ children: [new PageBreak()], spacing: { after: 0 } });
  }

  // ── Inline markdown parser ──────────────────────────────────────────────────
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

  // ── List detection ──────────────────────────────────────────────────────────
  function detectList(line: string): { type: "bullet" | "number" | null; text: string } {
    if (/^[-*]\s+/.test(line)) return { type: "bullet", text: line.replace(/^[-*]\s+/, "") };
    if (/^\d+[.)]\s+/.test(line)) return { type: "number", text: line.replace(/^\d+[.)]\s+/, "") };
    return { type: null, text: line };
  }

  // ── Body paragraph ──────────────────────────────────────────────────────────
  function bodyPara(text: string, firstInSection = false, size = SZ): Paragraph {
    return new Paragraph({
      children: parseInline(text, size),
      spacing: { line: LINE, after: SPA },
      indent: firstInSection ? undefined : { firstLine: INDENT },
    });
  }

  // ── Special element heading builder ─────────────────────────────────────────
  // All special sections (Case Study, Reflection, Exercise, Sidebar, Checklist,
  // Callout, Author's Workbench) render as a plain bold heading + regular body
  // paragraphs. No tables, no shading, no borders — they broke badly across pages.

  function buildSpecialSection(heading: string, paras: Paragraph[]): Array<Paragraph> {
    return [
      new Paragraph({
        children: [run(heading, { bold: true, size: SZ_SEC })],
        spacing: { before: 320, after: 200 },
      }),
      ...paras,
    ];
  }

  // ── Block renderer ──────────────────────────────────────────────────────────
  function renderBlocks(text: string, boxSize = SZ): Array<Paragraph> {
    const items: Array<Paragraph> = [];
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

      // Blockquote / pull quote — handles "> text", ">> text", "> > text"
      if (/^>+\s/.test(line)) {
        const quoteText = line.replace(/^>+\s*/, "").trim();
        items.push(new Paragraph({
          children: parseInline(quoteText, SZ),
          indent: { left: convertInchesToTwip(0.4), right: convertInchesToTwip(0.4) },
          spacing: { before: 200, after: 200, line: LINE },
        }));
        firstInSection = false;
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

  // ── Chapter block parser ────────────────────────────────────────────────────
  //
  // Two-phase strategy:
  //
  // Phase 1 — line scanner: explicitly detects CALLOUT blocks (which use a
  //   `> CALLOUT: Title` / `> Para` multiline format stored by Quill/Reed) and
  //   builds callout boxes directly, without letting their content bleed into
  //   surrounding regular text. Regular lines are buffered into `textBuf`.
  //
  // Phase 2 — buffer dispatch: when the buffer is flushed (at each CALLOUT
  //   boundary and at EOF), the accumulated regular text is processed through
  //   the existing special-element dispatcher (Reflection Questions, Sidebar,
  //   Exercise, Checklist, Case Study, Author's Workbench).
  //
  // CALLOUTs are intentionally excluded from ALL_SPECIAL_RE because they are
  // handled in phase 1. All other box types come from Quill's ### header
  // format and don't suffer from the bleed-through problem.
  function parseChapterContent(text: string): { bodyItems: Array<Paragraph> } {
    const items: Array<Paragraph> = [];

    // ── Phase 2 dispatch: flushes buffered regular text ───────────────────────
    function flushBuffer(buf: string[]) {
      if (buf.length === 0) return;
      const raw = buf.join("\n");
      buf.length = 0;

      // Split on Quill's ### special-element markers (excluding CALLOUT —
      // those are handled in phase 1 before we ever get here)
      const ALL_SPECIAL_RE = /\n(?=### (?:Reflection Questions|Exercise:|Sidebar:|Checklist:|Case Study:|The Author['']s Workbench))/;
      const segments = raw.split(ALL_SPECIAL_RE);

      for (const segment of segments) {
        const trimmed = segment.trim();
        if (!trimmed) continue;

        const headerMatch = trimmed.match(/^### (.+?)\n([\s\S]*)$/);
        if (headerMatch) {
          const rawHeader = (headerMatch[1] ?? "").trim();
          const content   = (headerMatch[2] ?? "").trim();

          const isWorkbench  = /^The Author['']s Workbench/i.test(rawHeader);
          const isReflection = /^Reflection Questions/i.test(rawHeader);
          const isExercise   = /^Exercise:/i.test(rawHeader);
          const isSidebar    = /^Sidebar:/i.test(rawHeader);
          const isChecklist  = /^Checklist:/i.test(rawHeader);
          const isCaseStudy  = /^Case Study:/i.test(rawHeader);

          if (isWorkbench || isReflection || isExercise || isSidebar || isChecklist || isCaseStudy) {
            const contentParas = renderBlocks(content).filter((b): b is Paragraph => b instanceof Paragraph);
            items.push(blankPara());
            items.push(...buildSpecialSection(rawHeader, contentParas));
            items.push(blankPara());
            continue;
          }
        }

        // Regular body text
        items.push(...renderBlocks(trimmed));
      }
    }

    // ── Phase 1 — line scanner ────────────────────────────────────────────────
    const lines = text.split("\n");
    const textBuf: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i] ?? "";

      // Detect CALLOUT in any of its stored formats:
      //   > CALLOUT: Title           (multiline, >-prefixed — what Quill/Reed saves)
      //   CALLOUT: Title             (bare, no >)
      //   CALLOUT: Title > > Para    (inline single-line)
      // Match CALLOUT: with optional > prefix and optional ** bold markers around the keyword
      // Handles: "CALLOUT: Title", "> CALLOUT: Title", "> **CALLOUT: Title**"
      const calloutMatch = line.match(/^>*\s*\*{0,2}CALLOUT:\s*(.+?)(?:\*+)?\s*$/i);

      if (!calloutMatch) {
        textBuf.push(line);
        i++;
        continue;
      }

      // Flush buffered regular text before emitting the callout box
      flushBuffer(textBuf);

      const rest = (calloutMatch[1] ?? "").trim();

      if (/>\s*>/.test(rest) || (rest.includes(">") && !/^[^>]*$/.test(rest))) {
        // ── Inline format: CALLOUT: Title > > Para 1 > > Para 2 ────────────
        const parts = rest.split(/\s*>\s*>\s*|\s+>\s+/).filter(p => p.trim());
        const title = (parts[0] ?? "").replace(/^>+\s*/, "").trim();
        const contentParas = parts
          .slice(1)
          .map(p => p.replace(/^>+\s*/, "").trim())
          .filter(Boolean)
          .map(p => bodyPara(p));
        items.push(blankPara());
        items.push(...buildSpecialSection(title, contentParas));
        items.push(blankPara());
        i++;
      } else {
        // ── Multiline format: > CALLOUT: Title / > Para 1 / > Para 2 ───────
        const title = rest.replace(/^>+\s*/, "").trim();
        const contentParas: Paragraph[] = [];
        i++;
        while (i < lines.length) {
          const next = (lines[i] ?? "").trim();
          if (/^>*\s*CALLOUT:/i.test(next)) break;
          if (/^>/.test(next)) {
            const stripped = next.replace(/^>+\s*/, "").trim();
            if (stripped) contentParas.push(bodyPara(stripped));
            i++;
          } else if (next === "") {
            i++;
          } else {
            break;
          }
        }
        items.push(blankPara());
        items.push(...buildSpecialSection(title, contentParas));
        items.push(blankPara());
      }
    }

    // Flush any remaining regular text
    flushBuffer(textBuf);

    return { bodyItems: items };
  }

  // ── Front matter builders ───────────────────────────────────────────────────
  function buildTitlePage(t: string, sub: string | null | undefined, aut: string): Paragraph[] {
    return [
      new Paragraph({ children: [run("")], spacing: { before: convertInchesToTwip(1.5), after: 0 } }),
      new Paragraph({
        children: [run(t, { size: SZ_BOOK, bold: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
      }),
      ...(sub ? [new Paragraph({
        children: [run(sub, { size: SZ_SUB, italics: true })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 960 },
      })] : [new Paragraph({ children: [run("")], spacing: { after: 960 } })]),
      new Paragraph({
        children: [run(aut)],
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

  function buildTocPage(chs: Array<{ title: string }>): Paragraph[] {
    if (!plan.tocIncluded) return [];
    return [
      new Paragraph({
        children: [run("Contents", { size: SZ_CH, bold: true })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: convertInchesToTwip(0.5), after: 480 },
      }),
      ...chs.map(ch => new Paragraph({
        children: [run(ch.title)],
        spacing: { after: 160 },
      })),
    ];
  }

  // ── Chapter builder ─────────────────────────────────────────────────────────
  function buildChapter(chTitle: string, body: string): Array<Paragraph> {
    const bareTitle = chTitle.replace(/^Chapter\s+\d+:\s*/i, "").trim();
    const numMatch  = chTitle.match(/^(Introduction|Chapter\s+\d+|Closing|Conclusion|Epilogue|Prologue|Foreword|Preface|Afterword)/i);
    const label     = numMatch?.[0] ?? null;

    const header: Array<Paragraph> = [
      pageBreakPara(),
      ...(label ? [new Paragraph({
        children: [run(label.toUpperCase(), { allCaps: true, size: 20 })],
        spacing: { before: convertInchesToTwip(0.75), after: 160 },
      })] : [new Paragraph({ children: [run("")], spacing: { before: convertInchesToTwip(0.75), after: 0 } })]),
      new Paragraph({
        children: [run(bareTitle || chTitle, { size: SZ_CH, bold: true })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 80, after: 480 },
      }),
    ];

    const { bodyItems } = parseChapterContent(body);
    return [...header, ...bodyItems];
  }

  // ── Back matter section ─────────────────────────────────────────────────────
  function buildBackSection(heading: string, content: string): Array<Paragraph> {
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

  // ── Resolve author name ─────────────────────────────────────────────────────
  let author = input.author ?? "Author";
  if (ts.titlePage) {
    const tpLines = ts.titlePage.split("\n").map(l => l.trim()).filter(Boolean);
    if (tpLines.length >= 2) author = tpLines[tpLines.length - 1] ?? author;
  }

  // ── Assemble document ───────────────────────────────────────────────────────
  const allChildren: Array<Paragraph> = [
    ...(input.proofNotice ? [new Paragraph({ children: [new TextRun({ text: input.proofNotice, bold: true, color: "AA0000", size: SZ_SEC })], alignment: AlignmentType.CENTER, spacing: { after: 480 } })] : []),
    ...buildTitlePage(title, subtitle, author),
    pageBreakPara(),
    ...buildCopyrightPage(ts.copyrightPage),
    pageBreakPara(),
    ...(ts.dedication ? [...buildDedicationPage(ts.dedication), pageBreakPara()] : []),
    ...buildTocPage(chapters),
    ...chapters.flatMap(ch => buildChapter(ch.title, ch.body)),
    ...buildBackSection("Bibliography", (input.bibliography ?? []).join("\n\n")),
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
        headers: { default: makeHeader() },
        footers: { default: makeFooter() },
        children: allChildren,
      },
    ],
  });

  return Packer.toBuffer(doc) as Promise<Buffer>;
}
