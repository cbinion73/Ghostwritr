import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { BookWorkflowType } from "@prisma/client";
import { db } from "@/lib/db";
import {
  buildCoverBrief,
  buildTypesetLayoutManifest,
  buildPrintStylesheet,
  buildTypesetInteriorHtml,
  sanitizeManuscriptFilename,
} from "@/lib/manuscript-document";
import {
  buildTypesetPlanInput,
  contentDisposition,
} from "@/lib/manuscript-export";
import { generateBibliography } from "@/lib/workflows/bibliography-generator";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<unknown> },
) {
  const tempDir = await mkdtemp(join(tmpdir(), "ghostwritr-typeset-package-"));
  const bundleDir = join(tempDir, "bundle");

  try {
    const { slug } = (await context.params) as { slug: string };

    // Quick lookup for bibliography gate-check (workflowType) and bookId
    const bookMeta = await db.book.findUnique({
      where: { slug },
      select: { id: true, workflowType: true, titleWorking: true },
    });

    const { payload, plan, publishingPackage } = await buildTypesetPlanInput(slug);
    const filenameBase = sanitizeManuscriptFilename(payload.title);
    const interiorHtml = buildTypesetInteriorHtml(payload, plan);
    const printCss = buildPrintStylesheet(plan);
    const layoutManifest = buildTypesetLayoutManifest(payload, plan);
    const coverBrief = buildCoverBrief(payload, plan);

    // ── Bibliography (non-fiction only) ──────────────────────────────────────
    const isNonFiction =
      bookMeta && bookMeta.workflowType !== BookWorkflowType.FICTION;
    let bibliographyHtml: string | null = null;
    let bibliographyCitationCount = 0;

    if (isNonFiction && bookMeta) {
      const bibResult = await generateBibliography(
        bookMeta.id,
        bookMeta.titleWorking ?? payload.title,
      );
      if (bibResult.citations.length > 0) {
        bibliographyHtml = bibResult.html;
        bibliographyCitationCount = bibResult.citations.length;
      }
    }

    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, `${filenameBase}-interior.html`), interiorHtml, "utf8");
    await writeFile(join(bundleDir, `${filenameBase}-print.css`), printCss, "utf8");
    await writeFile(join(bundleDir, "layout-manifest.json"), JSON.stringify(layoutManifest, null, 2), "utf8");
    await writeFile(join(bundleDir, "cover-brief.json"), JSON.stringify(coverBrief, null, 2), "utf8");

    // Write bibliography if generated
    if (bibliographyHtml) {
      await writeFile(join(bundleDir, "bibliography.html"), bibliographyHtml, "utf8");
    }

    const includedFiles = [
      `${filenameBase}-interior.html`,
      `${filenameBase}-print.css`,
      "layout-manifest.json",
      "cover-brief.json",
    ];
    if (bibliographyHtml) includedFiles.push("bibliography.html");

    // Ensure "Bibliography" appears in backMatter list when we have one
    const backMatter = [...(plan.backMatter ?? [])];
    if (bibliographyHtml && !backMatter.some((s) => /bibliography/i.test(s))) {
      backMatter.push("Bibliography");
    }

    await writeFile(
      join(bundleDir, "typeset-package.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          title: payload.title,
          subtitle: payload.subtitle ?? null,
          trimSize: plan.trimSize ?? null,
          trimProfile: plan.trimProfile ?? null,
          chapterCount: payload.chapterCount,
          totalWords: payload.totalWords,
          frontMatter: plan.frontMatter ?? [],
          backMatter,
          runningHeads: plan.runningHeads ?? null,
          chapterOpenerStyle: plan.chapterOpenerStyle ?? null,
          tocIncluded: plan.tocIncluded ?? true,
          estimatedFrontMatterPages: plan.estimatedFrontMatterPages ?? null,
          estimatedBodyPages: plan.estimatedBodyPages ?? null,
          estimatedBackMatterPages: plan.estimatedBackMatterPages ?? null,
          estimatedTotalPages: plan.estimatedTotalPages ?? null,
          signaturePageMultiple: plan.signaturePageMultiple ?? null,
          estimatedSignatureCount: plan.estimatedSignatureCount ?? null,
          estimatedBlankPages: plan.estimatedBlankPages ?? null,
          sectionStartsOnRecto: plan.sectionStartsOnRecto ?? true,
          preflightChecks: publishingPackage?.preflightChecks ?? [],
          bibliography: bibliographyHtml
            ? { included: true, citationCount: bibliographyCitationCount, format: "Chicago 17th edition" }
            : { included: false },
          includedFiles,
        },
        null,
        2,
      ),
      "utf8",
    );

    const zipPath = join(tempDir, `${filenameBase}-typeset-package.zip`);
    await execFileAsync("zip", ["-qjr", zipPath, bundleDir]);
    const zipBuffer = await readFile(zipPath);

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": contentDisposition(`${filenameBase}-typeset-package.zip`),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export typeset package.";
    const status =
      /required before manuscript export|No chapter drafts exist yet/i.test(message) ? 409 : 500;
    return new Response(message, { status });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
