/**
 * Simple test for document extraction
 */

const fs = require("fs");
const path = require("path");

// Test basic text extraction
const testFilePath = "/tmp/test-reference.txt";

console.log("\n=== Testing Document Extraction ===\n");

try {
  if (!fs.existsSync(testFilePath)) {
    console.error("✗ Test file not found:", testFilePath);
    process.exit(1);
  }

  const content = fs.readFileSync(testFilePath, "utf-8");
  console.log("✓ Successfully read test file");
  console.log(`  - File size: ${content.length} characters`);
  console.log(`  - First 300 characters:`);
  console.log(`    ${content.substring(0, 300).replace(/\n/g, "\n    ")}\n`);

  // Extract keywords
  const words = content
    .toLowerCase()
    .match(/\b\w{4,}\b/g)
    .filter((w) => !isStopWord(w));

  const frequency = {};
  words.forEach((word) => {
    frequency[word] = (frequency[word] || 0) + 1;
  });

  const topWords = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map((e) => `${e[0]} (${e[1]})`)
    .join(", ");

  console.log("✓ Top keywords extracted:");
  console.log(`  ${topWords}\n`);

  // Test chunking
  const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());
  console.log(`✓ Text chunked into ${paragraphs.length} paragraphs\n`);

  console.log("✅ Extraction test PASSED!\n");
  console.log(
    "This text would be stored in SourceDocument.extractedText for full-text search"
  );
} catch (error) {
  console.error("✗ Test failed:", error.message);
  process.exit(1);
}

function isStopWord(word) {
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
    "would",
    "should",
    "could",
    "also",
    "each",
  ]);
  return stopWords.has(word);
}
