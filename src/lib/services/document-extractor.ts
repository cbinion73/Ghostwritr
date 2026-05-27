/**
 * Document Extraction Service
 * Extracts text content from various file types for knowledge base indexing.
 *
 * PDFs are processed by Claude (claude-sonnet-4-6) via the Anthropic API's native
 * PDF document support. Claude reads the full PDF — text, diagrams, visual frameworks,
 * charts, tables, and images — and produces a structured knowledge document that
 * every downstream writing agent can reason over. Text-only extraction would silently
 * drop the visual models that are often the most important part of a source document.
 *
 * DOCX, TXT, CSV, JSON use local extraction (no API cost).
 */

import { readFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";

// ── PDF: Claude vision extraction ────────────────────────────────────────────

const CLAUDE_PDF_SYSTEM = `You are a precise document analyst. Your job is to extract ALL knowledge from a PDF — text, diagrams, frameworks, models, tables, and visual content — into a structured written document that a writing agent can read and use as reference material.

For every visual element (diagram, framework, model, chart, table, illustration):
- Describe what it is and its purpose
- Extract all labels, categories, axes, and values
- Explain the relationships and logic it depicts
- Quote key text embedded in the visual

Format output as clean, well-structured prose with clear section headers. Do not add commentary about the extraction process. Just deliver the knowledge.`;

const CLAUDE_PDF_PROMPT = `Extract all content from this PDF — every page of text, and a full description of every diagram, model, framework, chart, table, or visual element. Structure the output so a writing assistant can use it as a complete reference for the ideas, arguments, models, and frameworks this document contains.`;

/**
 * Extract from PDF using Claude's native PDF vision support.
 * Reads text AND images/diagrams — appropriate for PDFs containing visual models.
 * Falls back to text-only extraction if the Anthropic API key is unavailable.
 */
async function extractTextFromPDF(
  filePath: string,
  fileName: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // ── Claude vision path (preferred) ───────────────────────────────────────
  if (apiKey && apiKey.trim().length > 0) {
    try {
      const pdfBuffer = readFileSync(filePath);
      const base64Data = pdfBuffer.toString("base64");

      // Anthropic limits: 32 MB per document
      const MAX_PDF_BYTES = 32 * 1024 * 1024;
      if (pdfBuffer.byteLength > MAX_PDF_BYTES) {
        console.warn(
          `[extractTextFromPDF] ${fileName} is ${Math.round(pdfBuffer.byteLength / 1024 / 1024)}MB — exceeds 32MB Anthropic limit. Falling back to text-only extraction.`,
        );
        return await extractTextFromPDFTextOnly(filePath);
      }

      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        system: CLAUDE_PDF_SYSTEM,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: CLAUDE_PDF_PROMPT,
              },
            ],
          },
        ],
      });

      const extracted = response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n");

      console.log(
        `[extractTextFromPDF] Claude extracted ${extracted.length} chars from ${fileName} (vision + text)`,
      );
      return extracted.trim();
    } catch (error) {
      console.warn(
        `[extractTextFromPDF] Claude extraction failed for ${fileName}, falling back to text-only:`,
        error instanceof Error ? error.message : error,
      );
      // Fall through to text-only extraction
    }
  } else {
    console.warn(
      `[extractTextFromPDF] No ANTHROPIC_API_KEY — using text-only extraction for ${fileName}. Visual models and diagrams will not be captured.`,
    );
  }

  // ── Text-only fallback (no API key, or Claude call failed) ───────────────
  return await extractTextFromPDFTextOnly(filePath);
}

/**
 * Text-only PDF extraction using pdf-parse (no vision, no API cost).
 * Used as fallback when Claude is unavailable.
 */
async function extractTextFromPDFTextOnly(filePath: string): Promise<string> {
  try {
    const { PDFParse } = await import("pdf-parse");
    const pdfBuffer = readFileSync(filePath);
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    const result = await parser.getText();
    return (result.text ?? "").trim();
  } catch (error) {
    console.warn("[extractTextFromPDFTextOnly] extraction failed:", error);
    return "";
  }
}

// ── Main dispatcher ──────────────────────────────────────────────────────────

/**
 * Extract text content from a document file.
 * PDFs use Claude vision; all other types use local extraction.
 */
export async function extractTextFromDocument(
  filePath: string,
  mimeType: string,
  fileName: string,
  options: { useVision?: boolean } = {},
): Promise<string> {
  try {
    // Plain text / Markdown
    if (
      mimeType === "text/plain" ||
      mimeType === "text/markdown" ||
      mimeType.startsWith("text/") ||
      fileName.endsWith(".txt") ||
      fileName.endsWith(".md")
    ) {
      return extractTextFromPlain(filePath);
    }

    // PDF — Claude vision (Blueprint only) or text-only
    if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
      return options.useVision
        ? await extractTextFromPDF(filePath, fileName)
        : await extractTextFromPDFTextOnly(filePath);
    }

    // DOCX
    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx")
    ) {
      return await extractTextFromDocx(filePath);
    }

    // PPTX / PPT — extract text from slide XML via JSZip
    if (
      mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      mimeType === "application/vnd.ms-powerpoint" ||
      fileName.endsWith(".pptx") ||
      fileName.endsWith(".ppt")
    ) {
      return await extractTextFromPptx(filePath);
    }

    // JSON
    if (mimeType === "application/json" || fileName.endsWith(".json")) {
      return extractTextFromJSON(filePath);
    }

    // CSV
    if (
      mimeType === "text/csv" ||
      mimeType === "application/csv" ||
      fileName.endsWith(".csv")
    ) {
      return extractTextFromCSV(filePath);
    }

    // Unknown — try plain text
    console.warn(
      `[extractTextFromDocument] Unknown mime type: ${mimeType}. Attempting plain text extraction.`,
    );
    return extractTextFromPlain(filePath);
  } catch (error) {
    console.error(
      `[extractTextFromDocument] Error extracting from ${fileName}:`,
      error,
    );
    throw new Error(
      `Failed to extract text from ${fileName}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// ── Local extractors (no API cost) ──────────────────────────────────────────

function extractTextFromPlain(filePath: string): string {
  return readFileSync(filePath, "utf-8").trim();
}

async function extractTextFromDocx(filePath: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.trim();
  } catch (error) {
    console.warn("[extractTextFromDocx] DOCX extraction failed:", error);
    return "";
  }
}

/**
 * Extract text from PPTX by unzipping and reading slide XML.
 * PPTX is a ZIP archive; slide text lives in ppt/slides/slide*.xml <a:t> tags.
 */
async function extractTextFromPptx(filePath: string): Promise<string> {
  try {
    const JSZip = (await import("jszip")).default;
    const buf = readFileSync(filePath);
    const zip = await JSZip.loadAsync(buf);

    // Collect slide files in order
    const slideEntries = Object.keys(zip.files)
      .filter((name) => name.match(/^ppt\/slides\/slide\d+\.xml$/))
      .sort((a, b) => {
        const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0");
        const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0");
        return na - nb;
      });

    const texts: string[] = [];
    for (const entry of slideEntries) {
      const xml = await zip.files[entry].async("string");
      // Extract all <a:t> text runs and join with spaces
      const matches = xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g);
      const slideText = Array.from(matches)
        .map((m) => m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"))
        .filter((t) => t.trim().length > 0)
        .join(" ");
      if (slideText.trim()) texts.push(slideText.trim());
    }

    const result = texts.join("\n\n");
    console.log(`[extractTextFromPptx] Extracted ${result.length} chars from ${slideEntries.length} slides`);
    return result;
  } catch (error) {
    console.warn("[extractTextFromPptx] PPTX extraction failed:", error);
    return "";
  }
}

function extractTextFromJSON(filePath: string): string {
  try {
    return JSON.stringify(JSON.parse(readFileSync(filePath, "utf-8")), null, 2);
  } catch {
    return "";
  }
}

function extractTextFromCSV(filePath: string): string {
  try {
    return readFileSync(filePath, "utf-8").trim();
  } catch {
    return "";
  }
}

// ── Chunking utility ─────────────────────────────────────────────────────────

export function chunkText(
  text: string,
  chunkSize: number = 500,
  overlapSize: number = 100,
): string[] {
  if (!text || text.length === 0) return [];

  const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    const candidateChunk = currentChunk
      ? `${currentChunk}\n\n${paragraph}`
      : paragraph;

    if (candidateChunk.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = currentChunk.slice(-overlapSize) + "\n" + paragraph;
    } else {
      currentChunk = candidateChunk;
    }
  }

  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}
