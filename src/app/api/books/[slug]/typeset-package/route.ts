import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

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
    const { payload, plan, publishingPackage } = await buildTypesetPlanInput(slug);
    const filenameBase = sanitizeManuscriptFilename(payload.title);
    const interiorHtml = buildTypesetInteriorHtml(payload, plan);
    const printCss = buildPrintStylesheet(plan);
    const layoutManifest = buildTypesetLayoutManifest(payload, plan);
    const coverBrief = buildCoverBrief(payload, plan);

    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, `${filenameBase}-interior.html`), interiorHtml, "utf8");
    await writeFile(join(bundleDir, `${filenameBase}-print.css`), printCss, "utf8");
    await writeFile(join(bundleDir, "layout-manifest.json"), JSON.stringify(layoutManifest, null, 2), "utf8");
    await writeFile(join(bundleDir, "cover-brief.json"), JSON.stringify(coverBrief, null, 2), "utf8");
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
          backMatter: plan.backMatter ?? [],
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
          includedFiles: [
            `${filenameBase}-interior.html`,
            `${filenameBase}-print.css`,
            "layout-manifest.json",
            "cover-brief.json",
          ],
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
