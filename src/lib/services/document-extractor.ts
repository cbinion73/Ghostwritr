/**
 * Document Extraction Service
 * Extracts text content from various file types for knowledge base indexing
 */

import { readFileSync } from "fs";

/**
 * Extract text from different file types
 * Supports: TXT, PDF, basic DOCX, MD
 */
export async function extractTextFromDocument(
  filePath: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  try {
    // Plain text files
    if (
      mimeType === "text/plain" ||
      mimeType.startsWith("text/") ||
      fileName.endsWith(".txt") ||
      fileName.endsWith(".md")
    ) {
      return extractTextFromPlain(filePath);
    }

    // PDF files
    if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
      return await extractTextFromPDF(filePath);
    }

    // DOCX files
    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx")
    ) {
      return await extractTextFromDocx(filePath);
    }

    // JSON files
    if (mimeType === "application/json" || fileName.endsWith(".json")) {
      return extractTextFromJSON(filePath);
    }

    // CSV files
    if (
      mimeType === "text/csv" ||
      mimeType === "application/csv" ||
      fileName.endsWith(".csv")
    ) {
      return extractTextFromCSV(filePath);
    }

    // Markdown
    if (mimeType === "text/markdown" || fileName.endsWith(".md")) {
      return extractTextFromPlain(filePath);
    }

    // Unknown type - try plain text extraction as fallback
    console.warn(
      `[extractTextFromDocument] Unknown mime type: ${mimeType}. Attempting plain text extraction.`
    );
    return extractTextFromPlain(filePath);
  } catch (error) {
    console.error(
      `[extractTextFromDocument] Error extracting from ${fileName}:`,
      error
    );
    throw new Error(
      `Failed to extract text from ${fileName}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Extract from plain text files
 */
function extractTextFromPlain(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  return content.trim();
}

/**
 * Extract from PDF files
 * Requires: npm install pdfjs-dist
 */
async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    const pdfBuffer = readFileSync(filePath);
    const pdf = await pdfjsLib.getDocument(pdfBuffer).promise;

    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((item): item is any => "str" in item)
        .map((item) => item.str)
        .join(" ");
      fullText += pageText + "\n";
    }

    return fullText.trim();
  } catch (error) {
    console.warn("[extractTextFromPDF] PDF.js extraction failed:", error);
    // Fallback: return empty string rather than failing completely
    return "";
  }
}

/**
 * Extract from DOCX files
 * Requires: npm install mammoth
 */
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
 * Extract text from JSON files
 */
function extractTextFromJSON(filePath: string): string {
  try {
    const content = readFileSync(filePath, "utf-8");
    const json = JSON.parse(content);
    // Convert JSON to readable text format
    return JSON.stringify(json, null, 2);
  } catch (error) {
    console.warn("[extractTextFromJSON] JSON parsing failed:", error);
    return "";
  }
}

/**
 * Extract text from CSV files
 */
function extractTextFromCSV(filePath: string): string {
  try {
    const content = readFileSync(filePath, "utf-8");
    // CSV is already readable, just return with line breaks
    return content.trim();
  } catch (error) {
    console.warn("[extractTextFromCSV] CSV extraction failed:", error);
    return "";
  }
}

/**
 * Chunk text into smaller pieces for better embedding
 * Split by paragraph, then by sentences if needed
 */
export function chunkText(
  text: string,
  chunkSize: number = 500,
  overlapSize: number = 100
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
      // Current chunk is full, save it
      chunks.push(currentChunk);
      // Start new chunk with overlap
      currentChunk = currentChunk.slice(-overlapSize) + "\n" + paragraph;
    } else {
      currentChunk = candidateChunk;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
