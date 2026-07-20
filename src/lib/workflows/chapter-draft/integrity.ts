import type {
  ChapterDraftBundle,
  ChapterDraftIntegrityIssue,
  ChapterDraftIntegritySummary,
} from "../../chapter-draft-types";
import type { ChapterEvidenceRecord } from "../../source-evidence-contract";

export const CHAPTER_INTEGRITY_POLICY_VERSION = "chapter-integrity-v1";

const AUTHORITY_PATTERN = /\b([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+(?:\s+(?:à|de|di|van|von))?(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-]+){0,2})\s+(?:argued|claimed|concluded|described|discovered|found|observed|reported|said|taught|told|warned|wrote)\b/g;
const AUTHORITY_EXCLUSIONS = new Set([
  "Jesus", "God", "Christ", "Scripture", "The Bible", "The Gospels", "The New Testament",
  "The Old Testament", "Holy Spirit", "New Testament", "Old Testament",
]);

const BIBLE_REFERENCE_NEARBY = /\b(?:Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation)\s+\d{1,3}:\d{1,3}\b/i;

function normalize(value: string) {
  return value.toLocaleLowerCase().replace(/[“”‘’'".,:;!?()[\]{}]/g, " ").replace(/\s+/g, " ").trim();
}

function evidenceHaystack(records: ChapterEvidenceRecord[]) {
  return normalize(records.map((record) => [
    record.id,
    record.claimOrStory,
    record.supportingExcerpt,
    record.source?.author,
    record.source?.title,
    record.source?.publisher,
  ].filter(Boolean).join(" ")).join(" "));
}

function uniqueIssues(issues: ChapterDraftIntegrityIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}:${normalize(issue.exactText)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractAuthorities(text: string) {
  const names: string[] = [];
  for (const match of text.matchAll(AUTHORITY_PATTERN)) {
    const name = match[1].trim();
    if (!AUTHORITY_EXCLUSIONS.has(name)) names.push(name);
  }
  return [...new Set(names)];
}

function extractDirectQuotes(text: string) {
  const quotes: Array<{ text: string; index: number }> = [];
  const pattern = /[“"]([^”"\n]{20,})[”"]/g;
  for (const match of text.matchAll(pattern)) {
    if ((match[1].match(/\s+/g)?.length ?? 0) >= 5) {
      quotes.push({ text: match[1].trim(), index: match.index ?? 0 });
    }
  }
  return quotes;
}

function duplicatedSentences(text: string) {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean)) {
    if (sentence.split(/\s+/).length < 12) continue;
    const key = normalize(sentence);
    if (seen.has(key)) duplicates.push(sentence);
    else seen.set(key, sentence);
  }
  return duplicates;
}

export function auditChapterDraftIntegrity(input: {
  draft: ChapterDraftBundle;
  evidence: ChapterEvidenceRecord[];
}): ChapterDraftIntegritySummary {
  const { draft } = input;
  const evidence = input.evidence.filter((record) => record.admissibility === "ADMISSIBLE");
  const admissibleIds = new Set(evidence.map((record) => record.id));
  const claimedEvidenceIds = [...new Set([
    ...(draft.sourceUsage.researchItemIds ?? []),
    ...(draft.sourceUsage.externalStoryItemIds ?? []),
    ...draft.paragraphs.flatMap((paragraph) => paragraph.sourceNotes),
  ])];
  const usedEvidenceIds = claimedEvidenceIds.filter((id) => admissibleIds.has(id));
  const haystack = evidenceHaystack(evidence);
  const issues: ChapterDraftIntegrityIssue[] = [];

  for (const id of claimedEvidenceIds) {
    if (!admissibleIds.has(id)) {
      issues.push({
        code: "UNTRACEABLE_SOURCE_ID",
        severity: "blocker",
        exactText: id,
        reason: "The draft claims to use an evidence ID that is not currently admitted for this chapter.",
      });
    }
  }

  if (draft.sourceUsage.research.length > 0 && (draft.sourceUsage.researchItemIds?.length ?? 0) === 0) {
    issues.push({
      code: "MISSING_SOURCE_TRACE",
      severity: "blocker",
      exactText: draft.sourceUsage.research[0] ?? "research used",
      reason: "Research is reported as used, but no exact admitted research item ID was preserved.",
    });
  }
  if (draft.sourceUsage.externalStories.length > 0 && (draft.sourceUsage.externalStoryItemIds?.length ?? 0) === 0) {
    issues.push({
      code: "MISSING_SOURCE_TRACE",
      severity: "blocker",
      exactText: draft.sourceUsage.externalStories[0] ?? "external story used",
      reason: "An external story is reported as used, but no exact admitted story item ID was preserved.",
    });
  }

  const namedAuthorities = extractAuthorities(draft.chapterText);
  for (const authority of namedAuthorities) {
    if (!haystack.includes(normalize(authority))) {
      issues.push({
        code: "UNTRACEABLE_AUTHORITY",
        severity: "required",
        exactText: authority,
        reason: "A named authority is used in the prose but does not appear in the admitted chapter evidence.",
      });
    }
  }

  const directQuotes = extractDirectQuotes(draft.chapterText);
  for (const quote of directQuotes) {
    const nearby = draft.chapterText.slice(Math.max(0, quote.index - 100), quote.index + quote.text.length + 100);
    const normalizedQuote = normalize(quote.text);
    const supported = haystack.includes(normalizedQuote) || BIBLE_REFERENCE_NEARBY.test(nearby);
    if (!supported) {
      issues.push({
        code: "UNTRACEABLE_QUOTATION",
        severity: "required",
        exactText: quote.text,
        reason: "This direct quotation is not present in admitted evidence and is not locally identified as Scripture.",
      });
    }
  }

  const hasTrace = usedEvidenceIds.length > 0;
  const numericClaims = draft.chapterText.match(/\b(?:\d{1,3}(?:\.\d+)?\s*%|\d{1,3}(?:,\d{3})+|\d+\s+(?:percent|times per day|times a day))\b/gi) ?? [];
  if (numericClaims.length > 0 && !hasTrace) {
    issues.push({
      code: "UNTRACEABLE_NUMERIC_CLAIM",
      severity: "required",
      exactText: numericClaims[0] ?? "quantitative claim",
      reason: "A quantitative claim appears without any preserved admitted evidence ID.",
    });
  }

  const historicalClaims = draft.chapterText.match(/\b(?:in|during|since|by)\s+(?:the\s+)?(?:\d{3,4}|\d{1,2}(?:st|nd|rd|th)\s+century)\b/gi) ?? [];
  if (historicalClaims.length > 0 && !hasTrace) {
    issues.push({
      code: "UNTRACEABLE_HISTORICAL_CLAIM",
      severity: "required",
      exactText: historicalClaims[0] ?? "historical claim",
      reason: "A dated historical claim appears without any preserved admitted evidence ID.",
    });
  }

  const originalLanguageMatches = draft.chapterText.match(/[\u0370-\u03ff\u1f00-\u1fff\u0590-\u05ff]+|\b(?:the Greek|the Hebrew|Greek word|Hebrew word)\b/gi) ?? [];
  if (originalLanguageMatches.length > 0 && !hasTrace) {
    issues.push({
      code: "UNTRACEABLE_ORIGINAL_LANGUAGE",
      severity: "required",
      exactText: originalLanguageMatches[0] ?? "original-language material",
      reason: "Greek or Hebrew material appears without a preserved admitted lexical or textual source.",
    });
  }

  for (const sentence of duplicatedSentences(draft.chapterText)) {
    issues.push({
      code: "DUPLICATED_SENTENCE",
      severity: "required",
      exactText: sentence,
      reason: "This sentence appears more than once in the chapter.",
    });
  }

  if (draft.chapterText.includes("—")) {
    issues.push({
      code: "STYLE_VIOLATION",
      severity: "required",
      exactText: "—",
      reason: "The manuscript style sheet prohibits em dashes.",
    });
  }

  const unique = uniqueIssues(issues);
  return {
    policyVersion: CHAPTER_INTEGRITY_POLICY_VERSION,
    status: unique.some((issue) => issue.severity === "blocker" || issue.severity === "required")
      ? "fail"
      : unique.length > 0 ? "warn" : "pass",
    issues: unique,
    usedEvidenceIds,
    namedAuthorities,
    directQuotationCount: directQuotes.length,
    originalLanguageCount: originalLanguageMatches.length,
  };
}
