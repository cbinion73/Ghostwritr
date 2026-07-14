import { z } from "zod";

export const TRIM_PROFILES = {
  "5x8": {
    label: "5 x 8 in",
    widthIn: 5,
    heightIn: 8,
    margins: { topIn: 0.75, bottomIn: 0.75, insideIn: 0.75, outsideIn: 0.5, gutterIn: 0.125 },
  },
  "5.5x8.5": {
    label: "5.5 x 8.5 in",
    widthIn: 5.5,
    heightIn: 8.5,
    margins: { topIn: 0.75, bottomIn: 0.75, insideIn: 0.875, outsideIn: 0.5, gutterIn: 0.125 },
  },
  "6x9": {
    label: "6 x 9 in",
    widthIn: 6,
    heightIn: 9,
    margins: { topIn: 0.85, bottomIn: 0.85, insideIn: 0.875, outsideIn: 0.625, gutterIn: 0.125 },
  },
  "7x10": {
    label: "7 x 10 in",
    widthIn: 7,
    heightIn: 10,
    margins: { topIn: 0.875, bottomIn: 0.875, insideIn: 0.875, outsideIn: 0.625, gutterIn: 0.125 },
  },
} as const;

type TrimKey = keyof typeof TRIM_PROFILES;

const StringArraySchema = z.array(z.string()).default([]);

const TypesetPlanInputSchema = z.object({
  title: z.string().nullable().optional(),
  subtitle: z.string().nullable().optional(),
  trimSize: z.string().nullable().optional(),
  trimProfile: z.string().nullable().optional(),
  frontMatter: StringArraySchema.optional(),
  backMatter: StringArraySchema.optional(),
  runningHeads: z.string().nullable().optional(),
  chapterOpenerStyle: z.string().nullable().optional(),
  tocIncluded: z.boolean().optional(),
  sectionStartsOnRecto: z.boolean().optional(),
  signaturePageMultiple: z.number().int().positive().nullable().optional(),
  estimatedSignatureCount: z.number().int().nonnegative().nullable().optional(),
  estimatedBlankPages: z.number().int().nonnegative().nullable().optional(),
  estimatedFrontMatterPages: z.number().int().nonnegative().nullable().optional(),
  estimatedBodyPages: z.number().int().nonnegative().nullable().optional(),
  estimatedBackMatterPages: z.number().int().nonnegative().nullable().optional(),
  estimatedTotalPages: z.number().int().nonnegative().nullable().optional(),
  bodyFont: z.string().nullable().optional(),
  bodyPointSize: z.number().positive().nullable().optional(),
  lineHeightPt: z.number().positive().nullable().optional(),
  bleedIn: z.number().min(0).nullable().optional(),
  imageMinDpi: z.number().int().positive().nullable().optional(),
});

export type TypesetPlanInput = z.input<typeof TypesetPlanInputSchema>;

export type TypesetPlan = {
  title: string | null;
  subtitle: string | null;
  trimSize: string;
  trimProfile: string;
  trim: {
    key: TrimKey;
    label: string;
    widthIn: number;
    heightIn: number;
  };
  margins: {
    topIn: number;
    bottomIn: number;
    insideIn: number;
    outsideIn: number;
    gutterIn: number;
    bleedIn: number;
    mirrored: true;
  };
  typography: {
    bodyFont: string;
    bodyPointSize: number;
    lineHeightPt: number;
    paragraphFirstLineIndentIn: number;
  };
  chapterOpenerStyle: string;
  sectionBreak: "recto" | "next-page";
  sectionStartsOnRecto: boolean;
  tocIncluded: boolean;
  runningHeads: string;
  pageNumbering: {
    frontMatterStyle: "roman";
    bodyStyle: "arabic";
    bodyStartsAt: number;
    position: "footer-center";
  };
  headerFooter: {
    enabled: boolean;
    differentOddEven: boolean;
    oddHeader: string;
    evenHeader: string;
    footer: string;
  };
  imagePolicy: {
    minDpi: number;
    bleedAllowed: boolean;
    requireAltText: boolean;
  };
  frontMatter: string[];
  backMatter: string[];
  signaturePageMultiple: number;
  estimatedSignatureCount: number | null;
  estimatedBlankPages: number;
  estimatedFrontMatterPages: number | null;
  estimatedBodyPages: number | null;
  estimatedBackMatterPages: number | null;
  estimatedTotalPages: number | null;
  preflightRequiredChecks: string[];
};

function normalizeTrimKey(input: string | null | undefined): TrimKey {
  const normalized = (input ?? "")
    .toLowerCase()
    .replace(/\bin(?:ches)?\b/g, "")
    .replace(/\s+/g, "")
    .replace(/[×]/g, "x");

  if (normalized.includes("5.5x8.5")) return "5.5x8.5";
  if (normalized.includes("5x8")) return "5x8";
  if (normalized.includes("7x10")) return "7x10";
  return "6x9";
}

function cleanMatter(items: string[] | undefined, fallback: string[]) {
  const source = items && items.length > 0 ? items : fallback;
  return source.map((item) => item.trim()).filter(Boolean);
}

export function normalizeTypesetPlan(input: TypesetPlanInput = {}): TypesetPlan {
  const parsed = TypesetPlanInputSchema.parse(input);
  const trimKey = normalizeTrimKey(parsed.trimSize ?? parsed.trimProfile);
  const trimProfile = TRIM_PROFILES[trimKey];
  const sectionStartsOnRecto = parsed.sectionStartsOnRecto !== false;
  const runningHeads = parsed.runningHeads?.trim() || "Author / Title";
  const bodyFont = parsed.bodyFont?.trim() || "Baskerville";
  const bodyPointSize = parsed.bodyPointSize ?? 11.5;
  const lineHeightPt = parsed.lineHeightPt ?? 15;
  const bleedIn = parsed.bleedIn ?? 0;

  return {
    title: parsed.title ?? null,
    subtitle: parsed.subtitle ?? null,
    trimSize: trimProfile.label,
    trimProfile: `${trimProfile.label} KDP paperback`,
    trim: {
      key: trimKey,
      label: trimProfile.label,
      widthIn: trimProfile.widthIn,
      heightIn: trimProfile.heightIn,
    },
    margins: {
      ...trimProfile.margins,
      bleedIn,
      mirrored: true,
    },
    typography: {
      bodyFont,
      bodyPointSize,
      lineHeightPt,
      paragraphFirstLineIndentIn: 0.3,
    },
    chapterOpenerStyle: parsed.chapterOpenerStyle?.trim() || "classic",
    sectionBreak: sectionStartsOnRecto ? "recto" : "next-page",
    sectionStartsOnRecto,
    tocIncluded: parsed.tocIncluded !== false,
    runningHeads,
    pageNumbering: {
      frontMatterStyle: "roman",
      bodyStyle: "arabic",
      bodyStartsAt: 1,
      position: "footer-center",
    },
    headerFooter: {
      enabled: true,
      differentOddEven: true,
      oddHeader: parsed.title?.trim() || "Book Title",
      evenHeader: runningHeads,
      footer: "page-number",
    },
    imagePolicy: {
      minDpi: parsed.imageMinDpi ?? 300,
      bleedAllowed: bleedIn > 0,
      requireAltText: true,
    },
    frontMatter: cleanMatter(parsed.frontMatter, ["Title Page", "Copyright", "Table of Contents"]),
    backMatter: cleanMatter(parsed.backMatter, ["Bibliography", "About the Author"]),
    signaturePageMultiple: parsed.signaturePageMultiple ?? 16,
    estimatedSignatureCount: parsed.estimatedSignatureCount ?? null,
    estimatedBlankPages: parsed.estimatedBlankPages ?? 0,
    estimatedFrontMatterPages: parsed.estimatedFrontMatterPages ?? null,
    estimatedBodyPages: parsed.estimatedBodyPages ?? null,
    estimatedBackMatterPages: parsed.estimatedBackMatterPages ?? null,
    estimatedTotalPages: parsed.estimatedTotalPages ?? null,
    preflightRequiredChecks: [
      "all chapters have approved non-stale final revisions",
      "bibliography gaps reviewed",
      "trim size and mirrored margins match KDP profile",
      "page numbering starts after front matter",
      "table of contents included or intentionally disabled",
      "fonts are available or intentionally substituted",
      "images meet minimum DPI and bleed policy",
      "signature and blank-page math reviewed",
    ],
  };
}
