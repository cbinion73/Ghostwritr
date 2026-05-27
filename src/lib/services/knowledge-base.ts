/**
 * Knowledge Base Service
 * Manages storage, indexing, and retrieval of document knowledge
 */

import { db } from "../db";
import { extractTextFromDocument, chunkText } from "./document-extractor";

export interface KnowledgeChunk {
  id: string;
  bookId: string;
  sourceDocumentId: string;
  sourceTitle: string;
  chunkIndex: number;
  content: string;
  relevanceScore?: number;
}

type KnowledgeBaseSource = {
  title: string;
  extractedText: string | null;
};

/**
 * Process and extract text from an uploaded document
 * Stores the extracted text for full-text search
 */
export async function processDocumentForKnowledgeBase(input: {
  documentId: string;
  filePath: string;
  mimeType: string;
  fileName: string;
  /** When true, PDFs are sent to Claude for full vision extraction (text + diagrams). Default: false. */
  useVision?: boolean;
}): Promise<{ extractedText: string; chunkCount: number }> {
  try {
    console.log(
      `[processDocumentForKnowledgeBase] Processing: ${input.fileName}${input.useVision ? " (vision)" : ""}`
    );

    // Extract text from the document
    const extractedText = await extractTextFromDocument(
      input.filePath,
      input.mimeType,
      input.fileName,
      { useVision: input.useVision ?? false },
    );

    if (!extractedText || extractedText.length === 0) {
      console.warn(
        `[processDocumentForKnowledgeBase] No text extracted from ${input.fileName}`
      );
      // Still write to DB so the UI knows extraction finished.
      // null = still processing; "" = finished but no text found.
      await db.sourceDocument.update({
        where: { id: input.documentId },
        data: { extractedText: "", embeddingState: "FAILED" },
      });
      return { extractedText: "", chunkCount: 0 };
    }

    // Store extracted text in database for full-text search
    await db.sourceDocument.update({
      where: { id: input.documentId },
      data: {
        extractedText: extractedText.substring(0, 1000000), // Limit to 1MB per document
        embeddingState: "PENDING", // Mark for future embedding generation
      },
    });

    // Generate chunks for context window sizing
    const chunks = chunkText(extractedText, 1000, 200);

    console.log(
      `[processDocumentForKnowledgeBase] Extracted ${extractedText.length} characters in ${chunks.length} chunks`
    );

    return {
      extractedText,
      chunkCount: chunks.length,
    };
  } catch (error) {
    console.error(
      "[processDocumentForKnowledgeBase] Error:",
      error instanceof Error ? error.message : error
    );
    // Mark as failed so the UI stops spinning instead of waiting forever.
    try {
      await db.sourceDocument.update({
        where: { id: input.documentId },
        data: { extractedText: "", embeddingState: "FAILED" },
      });
    } catch {
      // Ignore secondary DB error — the original error is what matters.
    }
    throw error;
  }
}

/**
 * Search the knowledge base for relevant documents
 * Uses PostgreSQL full-text search for efficiency
 */
export async function searchKnowledgeBase(input: {
  bookId: string;
  query: string;
  limit?: number;
  stageKey?: string;
}): Promise<KnowledgeChunk[]> {
  // Use fallback search (keyword-based) which is more reliable
  // Full-text search has type casting issues in Prisma raw queries
  return fallbackSearch(input);
}

/**
 * Simple fallback search using substring matching
 */
async function fallbackSearch(input: {
  bookId: string;
  query: string;
  limit?: number;
}): Promise<KnowledgeChunk[]> {
  const limit = input.limit ?? 5;
  const queryLower = input.query.toLowerCase();

  // Split query into keywords for flexible matching
  const keywords = queryLower
    .split(/\s+/)
    .filter((k) => k.length > 0)
    .map((k) => k.replace(/[^\w]/g, "")); // Remove punctuation

  const documents = await db.sourceDocument.findMany({
    where: {
      bookId: input.bookId,
      extractedText: {
        not: null,
      },
    },
  });

  // Score documents by keyword matches
  const scored = documents
    .map((doc) => {
      const docTextLower = (doc.extractedText ?? "").toLowerCase();

      // Count total keyword matches
      let totalScore = 0;
      for (const keyword of keywords) {
        const matches = docTextLower.split(keyword).length - 1;
        totalScore += matches;
      }

      // If no keyword matches, return score 0
      if (totalScore === 0) {
        return { document: doc, score: 0 };
      }

      return { document: doc, score: totalScore };
    })
    .filter((s) => s.score > 0) // Only include documents with matches
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => ({
    id: s.document.id,
    bookId: s.document.bookId!,
    sourceDocumentId: s.document.id,
    sourceTitle: s.document.title,
    chunkIndex: 0,
    content: s.document.extractedText ?? "",
    relevanceScore: s.score,
  }));
}

/**
 * Get all extracted knowledge for a book
 * Useful for context that doesn't require specific search
 */
export async function getBookKnowledgeBase(
  bookId: string,
  maxLength: number = 50000
): Promise<{ content: string; sourceCount: number }> {
  const documents = await db.sourceDocument.findMany({
    where: {
      bookId,
      extractedText: {
        not: null,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return selectKnowledgeBaseContent(documents, maxLength);
}

export function selectKnowledgeBaseContent(
  documents: KnowledgeBaseSource[],
  maxLength: number,
): { content: string; sourceCount: number } {
  let totalContent = "";
  let includedCount = 0;

  for (const doc of documents) {
    if (!doc.extractedText) continue;

    const docSection = `\n---\nSource: ${doc.title}\n---\n${doc.extractedText}\n`;

    if (totalContent.length + docSection.length > maxLength) {
      // If the newest document is too large on its own, skip it and keep looking
      // for smaller sources so we still preserve some grounding.
      if (includedCount === 0) {
        continue;
      }

      break;
    }

    totalContent += docSection;
    includedCount++;
  }

  return {
    content: totalContent,
    sourceCount: includedCount,
  };
}

/**
 * Format knowledge base results for inclusion in AI prompts
 */
export function formatKnowledgeForPrompt(chunks: KnowledgeChunk[]): string {
  if (chunks.length === 0) {
    return "No relevant knowledge base materials found.";
  }

  const formatted = chunks
    .map(
      (chunk, i) =>
        `Source ${i + 1}: ${chunk.sourceTitle}\n${chunk.content.substring(0, 1000)}${chunk.content.length > 1000 ? "..." : ""}`
    )
    .join("\n\n---\n\n");

  return `Knowledge Base Context:\n\n${formatted}`;
}
