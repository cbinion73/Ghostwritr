/**
 * One-shot bibliography generation for a specific book.
 * Usage: tsx scripts/generate-bibliography.ts <bookId>
 *
 * Reads Scout research artifacts, calls Haiku to extract Chicago citations,
 * and writes bibliography.html to the project root (or a path you specify).
 */

// Load .env before any imports that need API keys
import { readFileSync } from "fs";
import { resolve } from "path";

function loadDotEnv() {
  try {
    const envPath = resolve(process.cwd(), ".env");
    const lines = readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
      }
    }
  } catch { /* no .env — that's fine in production */ }
}
loadDotEnv();

import { writeFile } from "fs/promises";
import { join } from "path";
import { generateBibliography } from "@/lib/workflows/bibliography-generator";
import { db } from "@/lib/db";

const bookId = process.argv[2];
if (!bookId) {
  console.error("Usage: tsx scripts/generate-bibliography.ts <bookId>");
  process.exit(1);
}

async function main() {
  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { titleWorking: true, slug: true },
  });

  if (!book) {
    console.error(`Book not found: ${bookId}`);
    process.exit(1);
  }

  console.log(`Generating bibliography for: ${book.titleWorking}`);
  console.log("ANTHROPIC_API_KEY present:", !!process.env.ANTHROPIC_API_KEY);
  console.log("Reading Scout research dossiers…");

  const { citations, html } = await generateBibliography(bookId, book.titleWorking ?? "Untitled");

  if (citations.length === 0) {
    console.log("No citations found in Scout research artifacts.");
    process.exit(0);
  }

  console.log(`\nFound ${citations.length} unique citations:\n`);
  citations.forEach((c, i) => console.log(`${i + 1}. ${c}`));

  const outPath = join(process.cwd(), `bibliography-${book.slug}.html`);
  await writeFile(outPath, html, "utf8");
  console.log(`\nBibliography HTML written to: ${outPath}`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
