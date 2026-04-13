/**
 * Test script for knowledge base extraction and search
 * Run with: npx ts-node src/lib/services/test-knowledge-base.ts
 */

import { extractTextFromDocument, chunkText } from "./document-extractor";
import { searchKnowledgeBase, formatKnowledgeForPrompt } from "./knowledge-base";

async function testExtraction() {
  console.log("\n=== Testing Document Extraction ===\n");

  try {
    // Test with a text file
    const testFilePath = "/tmp/test-reference.txt";
    const extractedText = await extractTextFromDocument(
      testFilePath,
      "text/plain",
      "test-reference.txt"
    );

    console.log("✓ Text extraction successful");
    console.log(`  - Extracted characters: ${extractedText.length}`);
    console.log(`  - First 200 chars: ${extractedText.substring(0, 200)}...`);

    // Test chunking
    const chunks = chunkText(extractedText, 1000, 200);
    console.log(`\n✓ Text chunking successful`);
    console.log(`  - Number of chunks: ${chunks.length}`);
    console.log(`  - Chunk sizes: ${chunks.map((c) => c.length).join(", ")}`);

    // Test keywords extraction
    const keywords = extractKeywords(extractedText);
    console.log(`\n✓ Keywords extracted: ${keywords.slice(0, 10).join(", ")}`);

    return extractedText;
  } catch (error) {
    console.error("✗ Extraction test failed:", error);
    throw error;
  }
}

function extractKeywords(text: string, limit: number = 20): string[] {
  // Simple keyword extraction - words that appear frequently
  const words = text
    .toLowerCase()
    .match(/\b\w{4,}\b/g) // Words 4+ characters
    ?.filter((word) => !isStopWord(word)) || [];

  const frequency: Record<string, number> = {};
  words.forEach((word) => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map((entry) => entry[0]);
}

function isStopWord(word: string): boolean {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "you",
    "that",
    "this",
    "from",
    "your",
    "will",
    "have",
    "with",
    "more",
    "than",
    "what",
    "been",
    "when",
    "they",
    "which",
    "where",
    "about",
  ]);
  return stopWords.has(word);
}

async function main() {
  try {
    console.log("Starting Knowledge Base Tests...");
    await testExtraction();
    console.log("\n✓ All tests passed!");
  } catch (error) {
    console.error("\n✗ Tests failed:", error);
    process.exit(1);
  }
}

main();
