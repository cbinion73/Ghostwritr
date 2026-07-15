/** Deterministic reader bibliography built only from the immutable approved ledger. */
import { z } from "zod";

import { getCurrentLockedCitationLedger, type LockedCitationEntry } from "@/lib/repositories/citation-audit";

export type BibliographyGap = {
  severity: "warn" | "fail";
  chapterKey: string;
  chapterLabel: string;
  sourceRecordId?: string;
  sourceTitle?: string;
  detail: string;
};

export type BibliographyReport = {
  generatedAt: string;
  citations: string[];
  sourceCount: number;
  incompleteCitations: BibliographyGap[];
  citationStyle?: string;
  ledgerFingerprint?: string;
};

const LockedEntrySchema = z.object({
  sourceRecordId: z.string(),
  evidenceKeys: z.array(z.string()).min(1),
  title: z.string(),
  author: z.string().nullable(),
  publisher: z.string().nullable(),
  publishedAt: z.string().nullable(),
  accessedAt: z.string().nullable(),
  url: z.string(),
  chapters: z.array(z.string()),
  citationOverride: z.string().optional(),
});

function escHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatLockedCitation(source: LockedCitationEntry, style: "CHICAGO_17" | "APA_7" | "MLA_9") {
  if (source.citationOverride?.trim()) return source.citationOverride.trim();
  const author = source.author?.trim() || "Unknown author";
  const year = source.publishedAt ? source.publishedAt.slice(0, 4) : "n.d.";
  const accessed = source.accessedAt ? source.accessedAt.slice(0, 10) : null;
  if (style === "APA_7") return `${author}. (${year}). ${source.title}. ${source.publisher ?? ""}. ${source.url}`.replace(/\s+\./g, ".").replace(/\s+/g, " ").trim();
  if (style === "MLA_9") return `${author}. “${source.title}.” ${source.publisher ?? ""}, ${year}, ${source.url}.${accessed ? ` Accessed ${accessed}.` : ""}`.replace(/\s+/g, " ").trim();
  return `${author}. “${source.title}.” ${source.publisher ? `${source.publisher}, ` : ""}${year}. ${source.url}.${accessed ? ` Accessed ${accessed}.` : ""}`.replace(/\s+/g, " ").trim();
}

export function buildBibliographyHtml(bookTitle: string, citations: string[]) {
  const entries = citations.length
    ? citations.map((citation) => `<p class="bib-entry">${escHtml(citation)}</p>`).join("\n")
    : "<p><em>No external sources were used in the approved final prose.</em></p>";
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Bibliography — ${escHtml(bookTitle)}</title><style>body{font-family:"Times New Roman",serif;font-size:12pt;margin:2.5cm;line-height:1.6}.bib-entry{margin:0 0 .75em 2em;text-indent:-2em}</style></head><body><h1>Bibliography</h1>${entries}</body></html>`;
}

export async function generateBibliography(bookId: string, bookTitle: string): Promise<{ citations: string[]; html: string; report: BibliographyReport }> {
  const ledger = await getCurrentLockedCitationLedger(bookId);
  if (!ledger) throw new Error("PUBLICATION_CITATION_BLOCKED: The approved citation ledger is missing or stale.");
  const parsed = z.array(LockedEntrySchema).safeParse(ledger.entriesJson);
  if (!parsed.success) throw new Error("PUBLICATION_CITATION_BLOCKED: The approved citation ledger is invalid.");
  const citations = (parsed.data as LockedCitationEntry[])
    .map((entry) => formatLockedCitation(entry, ledger.citationStyle))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  const report: BibliographyReport = {
    generatedAt: ledger.lockedAt.toISOString(), citations, sourceCount: citations.length,
    incompleteCitations: [], citationStyle: ledger.citationStyle, ledgerFingerprint: ledger.ledgerFingerprint,
  };
  return { citations, html: buildBibliographyHtml(bookTitle, citations), report };
}
