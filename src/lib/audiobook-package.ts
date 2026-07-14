import type { ManuscriptExportPayload } from "./manuscript-document";

export type AudiobookProductionPackage = {
  generatedAt: string;
  title: string;
  subtitle: string | null;
  estimatedRuntime: {
    wordsPerHour: number;
    totalWords: number;
    hours: number;
    display: string;
  };
  narratorDirection: {
    tone: string;
    pacing: string;
    emotionalDirection: string[];
    multiVoiceGuidance: string;
  };
  pronunciationGuide: {
    acronyms: string[];
    termsForReview: string[];
  };
  chapterBreaks: Array<{
    chapterKey: string;
    chapterLabel: string;
    estimatedMinutes: number;
    breakInstruction: string;
    deliveryNotes: string[];
  }>;
  quoteAndTableInstructions: string[];
  sensitivePassageInstructions: string[];
  productionInstructions: string[];
};

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function extractAcronyms(text: string) {
  return unique(text.match(/\b[A-Z]{2,}\b/g) ?? []).slice(0, 40);
}

function extractTermsForReview(text: string) {
  return unique(text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g) ?? [])
    .filter((term) => !/^Chapter\s+\d+/i.test(term))
    .slice(0, 40);
}

function displayRuntime(hours: number) {
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (wholeHours === 0) return `${minutes} min`;
  return `${wholeHours} hr ${minutes} min`;
}

export function buildAudiobookProductionPackage(
  payload: ManuscriptExportPayload,
  metadata: Record<string, unknown> | null | undefined = {},
): AudiobookProductionPackage {
  const fullText = payload.chapters.map((chapter) => chapter.chapterText).join("\n\n");
  const wordsPerHour = 9000;
  const hours = Number((payload.totalWords / wordsPerHour).toFixed(2));
  const voiceTone = typeof metadata?.voiceTone === "string" && metadata.voiceTone.trim()
    ? metadata.voiceTone.trim()
    : "warm, clear, human, and steady";
  const readerLevel = typeof metadata?.readerLevel === "string" ? metadata.readerLevel : "general";
  const hasQuotes = /(^|\n)\s*>|“|”|"\w/.test(fullText);
  const hasTables = /\|.+\|/.test(fullText) || /\btable\b/i.test(fullText);

  return {
    generatedAt: new Date().toISOString(),
    title: payload.title,
    subtitle: payload.subtitle ?? null,
    estimatedRuntime: {
      wordsPerHour,
      totalWords: payload.totalWords,
      hours,
      display: displayRuntime(hours),
    },
    narratorDirection: {
      tone: voiceTone,
      pacing:
        readerLevel === "expert" || readerLevel === "professional"
          ? "Measured and precise. Slow slightly for frameworks, lists, citations, and dense claims."
          : "Conversational and accessible. Let story moments breathe, then tighten pace through practical instruction.",
      emotionalDirection: [
        "Preserve the author's earned conviction without making the read theatrical.",
        "Use warmth on personal or reflective passages, clarity on frameworks, and restraint on claims or citations.",
        "End chapters with a slight sense of completion and forward motion rather than a hard sell.",
      ],
      multiVoiceGuidance:
        "Use one primary narrator voice. Do not invent character voices. Lightly distinguish quoted material with cadence and pause, not accents.",
    },
    pronunciationGuide: {
      acronyms: extractAcronyms(fullText),
      termsForReview: extractTermsForReview(fullText),
    },
    chapterBreaks: payload.chapters.map((chapter) => ({
      chapterKey: chapter.chapterKey,
      chapterLabel: chapter.chapterLabel,
      estimatedMinutes: Math.max(1, Math.round((chapter.wordCount / wordsPerHour) * 60)),
      breakInstruction: "Record as a separate chapter file. Leave 1-2 seconds of room tone at start and end.",
      deliveryNotes: [
        `Section: ${chapter.sectionTitle || "Main manuscript"}.`,
        chapter.reviewSummary
          ? `Editorial note for narrator context only: ${chapter.reviewSummary}`
          : "Maintain the book's established tone and pacing.",
      ],
    })),
    quoteAndTableInstructions: [
      hasQuotes
        ? "Quotes are present. Introduce quoted material with a subtle pause and return immediately to narrator voice afterward."
        : "No obvious quote-heavy passages detected; still watch for inline quoted material during recording.",
      hasTables
        ? "Table-like material appears in the manuscript. Convert tables into listener-friendly prose before recording or mark them for producer adaptation."
        : "No table-heavy passages detected.",
    ],
    sensitivePassageInstructions: [
      "Do not heighten sensitive stories for drama. Read plainly, with respect and emotional steadiness.",
      "If a passage involves grief, trauma, failure, conflict, faith, or family material, prioritize dignity over performance.",
      "Flag any passage that feels legally, pastorally, or personally sensitive before final recording.",
    ],
    productionInstructions: [
      "Target ACX-compatible delivery: 44.1 kHz sample rate, constant bitrate MP3, consistent RMS/noise floor, and one file per chapter.",
      "Use the chapter file names and order from this package. Do not merge chapters unless the publisher explicitly requests it.",
      "Listen through after mastering for repeated sentences, clipped breaths, mouth noise, room tone mismatch, and accidental changes to quoted/source material.",
      "Treat this as a production instruction package for an external AI audiobook agent or human narrator, not as synthesized audio.",
    ],
  };
}

export function buildAudiobookPackageMarkdown(pkg: AudiobookProductionPackage) {
  return [
    `# Audiobook Production Package — ${pkg.title}`,
    pkg.subtitle ? `_${pkg.subtitle}_` : "",
    "",
    `Estimated runtime: ${pkg.estimatedRuntime.display} (${pkg.estimatedRuntime.totalWords.toLocaleString()} words at ${pkg.estimatedRuntime.wordsPerHour.toLocaleString()} words/hour)`,
    "",
    "## Narrator Direction",
    `Tone: ${pkg.narratorDirection.tone}`,
    `Pacing: ${pkg.narratorDirection.pacing}`,
    "",
    ...pkg.narratorDirection.emotionalDirection.map((item) => `- ${item}`),
    `- ${pkg.narratorDirection.multiVoiceGuidance}`,
    "",
    "## Pronunciation Guide",
    `Acronyms: ${pkg.pronunciationGuide.acronyms.join(", ") || "None detected"}`,
    `Terms to review: ${pkg.pronunciationGuide.termsForReview.join(", ") || "None detected"}`,
    "",
    "## Chapter Recording Notes",
    ...pkg.chapterBreaks.flatMap((chapter) => [
      `### ${chapter.chapterLabel}`,
      `Estimated recording time: ${chapter.estimatedMinutes} min`,
      chapter.breakInstruction,
      ...chapter.deliveryNotes.map((note) => `- ${note}`),
      "",
    ]),
    "## Quote, Table, and Sensitive Passage Instructions",
    ...pkg.quoteAndTableInstructions.map((item) => `- ${item}`),
    ...pkg.sensitivePassageInstructions.map((item) => `- ${item}`),
    "",
    "## Production Instructions",
    ...pkg.productionInstructions.map((item) => `- ${item}`),
    "",
  ].filter(Boolean).join("\n");
}
