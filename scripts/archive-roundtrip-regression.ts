import fs from "node:fs/promises";
import path from "node:path";

import { createBookArchive, importBookArchiveBuffer } from "../src/lib/book-archive";
import { deleteBookBySlug, getBookBySlug } from "../src/lib/repositories/books";

const SOURCE_SLUGS = ["nonfiction-smoke", "fiction-smoke"] as const;
const OUTPUT_DIR = path.resolve("test-results/archive-roundtrip-regression");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const results: Array<Record<string, unknown>> = [];

  for (const slug of SOURCE_SLUGS) {
    const archive = await createBookArchive(slug);
    const imported = await importBookArchiveBuffer({
      bytes: new Uint8Array(archive.bytes),
      fileName: archive.filename,
    });

    const importedBook = await getBookBySlug(imported.slug);
    const archiveAgain = await createBookArchive(imported.slug);

    results.push({
      sourceSlug: slug,
      archiveFileName: archive.filename,
      archiveByteLength: archive.bytes.byteLength,
      importedSlug: imported.slug,
      workflowType: imported.workflowType,
      stageCount: importedBook?.stages.length ?? 0,
      artifactCount: importedBook?.artifacts.length ?? 0,
      roundtripArchiveBytes: archiveAgain.bytes.byteLength,
    });

    await deleteBookBySlug(imported.slug);
  }

  const reportPath = path.join(OUTPUT_DIR, "report.json");
  await fs.writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );

  const failures = results.filter(
    (result) =>
      Number(result.stageCount ?? 0) === 0 ||
      Number(result.artifactCount ?? 0) === 0 ||
      Number(result.archiveByteLength ?? 0) === 0 ||
      Number(result.roundtripArchiveBytes ?? 0) === 0,
  );

  console.log(JSON.stringify({ reportPath, failures, results }, null, 2));
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
