import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildManuscriptHtml,
  buildManuscriptMarkdown,
  buildCoverBrief,
  buildDistributionManifest,
  buildPrintStylesheet,
  buildTypesetLayoutManifest,
  buildTypesetInteriorHtml,
  sanitizeManuscriptFilename,
} from "@/lib/manuscript-document";
import {
  buildManuscriptExportPayload,
  buildTypesetPlanInput,
  contentDisposition,
  convertHtmlToDocx,
  getLatestPublishingPackage,
} from "@/lib/manuscript-export";
import { getBookBySlugOrThrow } from "@/lib/repositories/books";
import { getLatestEditingArtifactVersion } from "@/lib/repositories/editing-artifacts";
import { ArtifactType } from "@prisma/client";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const tempDir = await mkdtemp(join(tmpdir(), "ghostwritr-publish-package-"));
  const bundleDir = join(tempDir, "bundle");

  try {
    const { slug } = await context.params;
    const book = await getBookBySlugOrThrow(slug);
    const payload = await buildManuscriptExportPayload(slug);
    const { plan } = await buildTypesetPlanInput(slug);
    const publishingPackage = await getLatestPublishingPackage(slug);
    const [provenanceVersion, marketingVersion] = await Promise.all([
      getLatestEditingArtifactVersion(book.id, ArtifactType.PROVENANCE_REPORT),
      getLatestEditingArtifactVersion(book.id, ArtifactType.MARKETING_HANDOFF_PACKAGE),
    ]);
    const filenameBase = sanitizeManuscriptFilename(payload.title);
    const html = buildManuscriptHtml(payload);
    const interiorHtml = buildTypesetInteriorHtml(payload, plan);
    const printCss = buildPrintStylesheet(plan);
    const layoutManifest = buildTypesetLayoutManifest(payload, plan);
    const coverBrief = buildCoverBrief(payload, plan);
    const distributionManifest = buildDistributionManifest(payload, plan);
    const markdown = buildManuscriptMarkdown(payload);
    const docx = await convertHtmlToDocx(html, filenameBase);

    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, `${filenameBase}.html`), html, "utf8");
    await writeFile(join(bundleDir, `${filenameBase}-interior.html`), interiorHtml, "utf8");
    await writeFile(join(bundleDir, `${filenameBase}-print.css`), printCss, "utf8");
    await writeFile(join(bundleDir, "layout-manifest.json"), JSON.stringify(layoutManifest, null, 2), "utf8");
    await writeFile(join(bundleDir, "cover-brief.json"), JSON.stringify(coverBrief, null, 2), "utf8");
    await writeFile(join(bundleDir, "distribution-manifest.json"), JSON.stringify(distributionManifest, null, 2), "utf8");
    await writeFile(join(bundleDir, `${filenameBase}.md`), markdown, "utf8");
    await writeFile(join(bundleDir, `${filenameBase}.json`), JSON.stringify(payload, null, 2), "utf8");
    await writeFile(join(bundleDir, `${filenameBase}.docx`), docx);
    if (provenanceVersion?.contentJson) {
      await writeFile(join(bundleDir, "provenance-report.json"), JSON.stringify(provenanceVersion.contentJson, null, 2), "utf8");
    }
    if (marketingVersion?.contentJson) {
      await writeFile(join(bundleDir, "marketing-handoff.json"), JSON.stringify(marketingVersion.contentJson, null, 2), "utf8");
    }
    await writeFile(
      join(bundleDir, "publish-package.json"),
      JSON.stringify(
        {
          title: payload.title,
          subtitle: payload.subtitle ?? null,
          generatedAt: new Date().toISOString(),
          manuscript: {
            totalWords: payload.totalWords,
            chapterCount: payload.chapterCount,
            draftedChapterCount: payload.draftedChapterCount,
            trimSize: payload.trimSize ?? null,
          },
          package: publishingPackage,
          includedFiles: [
            `${filenameBase}.docx`,
            `${filenameBase}.html`,
            `${filenameBase}-interior.html`,
            `${filenameBase}-print.css`,
            "layout-manifest.json",
            "cover-brief.json",
            "distribution-manifest.json",
            `${filenameBase}.md`,
            `${filenameBase}.json`,
            ...(provenanceVersion?.contentJson ? ["provenance-report.json"] : []),
            ...(marketingVersion?.contentJson ? ["marketing-handoff.json"] : []),
          ],
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      join(bundleDir, "preflight-report.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          title: payload.title,
          packageStatus: publishingPackage?.packageStatus ?? "draft",
          trimSize: publishingPackage?.trimSize ?? payload.trimSize ?? null,
          targetPageCount: publishingPackage?.targetPageCount ?? null,
          preflightChecks: publishingPackage?.preflightChecks ?? [],
          typesettingPlan: publishingPackage?.typesettingPlan ?? null,
          estimatedTotalPages: publishingPackage?.typesettingPlan?.estimatedTotalPages ?? null,
          estimatedSignatureCount: publishingPackage?.typesettingPlan?.estimatedSignatureCount ?? null,
          estimatedBlankPages: publishingPackage?.typesettingPlan?.estimatedBlankPages ?? null,
        },
        null,
        2,
      ),
      "utf8",
    );

    const zipPath = join(tempDir, `${filenameBase}-publish-package.zip`);
    await execFileAsync("zip", ["-qjr", zipPath, bundleDir]);
    const zipBuffer = await readFile(zipPath);

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": contentDisposition(`${filenameBase}-publish-package.zip`),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export publish package.";
    const status =
      /required before manuscript export|No chapter drafts exist yet/i.test(message) ? 409 : 500;
    return new Response(message, { status });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
