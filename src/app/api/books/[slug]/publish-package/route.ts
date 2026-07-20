import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildEbookSourceHtml,
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
  getLatestPublishingPackage,
} from "@/lib/manuscript-export";
import { buildKdpDocx } from "@/lib/kdp-docx-export";
import { buildKdpPdfFromHtml } from "@/lib/kdp-pdf-export";
import { buildTypesetPreflightReport } from "@/lib/typeset-preflight";
import { buildAudiobookPackageMarkdown, buildAudiobookProductionPackage } from "@/lib/audiobook-package";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { getLatestEditingArtifactVersion } from "@/lib/repositories/editing-artifacts";
import { ArtifactType } from "@prisma/client";
import { generateBibliography } from "@/lib/workflows/bibliography-generator";
import { buildPublicationProofMetadata, requirePublicationCitationReady } from "@/lib/publication-citation-gate";
import { requirePublicationPassReady } from "@/lib/publication-pass-gate";

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
    const user = await requireAuthenticatedAppUser();
    const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
    const proofMode = new URL(_request.url).searchParams.get("mode") === "proof";
    const citationGate = await requirePublicationCitationReady(book.id, proofMode);
    const publicationPassGate = await requirePublicationPassReady(book.id, proofMode);
    const payload = await buildManuscriptExportPayload(slug);
    const { plan } = await buildTypesetPlanInput(slug);
    const publishingPackage = await getLatestPublishingPackage(slug);
    const bibliography = citationGate.ledger
      ? await generateBibliography(book.id, payload.title)
      : { citations: [] as string[], html: `<!doctype html><html><body><h1>${citationGate.proofNotice}</h1></body></html>`, report: { generatedAt: new Date().toISOString(), citations: [] as string[], sourceCount: 0, incompleteCitations: citationGate.blockers.map((detail) => ({ severity: "fail" as const, chapterKey: "publication", chapterLabel: "Publication", detail })) } };
    payload.bibliography = bibliography.citations;
    payload.proofNotice = [citationGate.proofNotice, publicationPassGate.proofNotice].filter(Boolean).join(" · ") || null;
    const [provenanceVersion, marketingVersion] = await Promise.all([
      getLatestEditingArtifactVersion(book.id, ArtifactType.PROVENANCE_REPORT),
      getLatestEditingArtifactVersion(book.id, ArtifactType.MARKETING_HANDOFF_PACKAGE),
    ]);
    const filenameBase = sanitizeManuscriptFilename(payload.title);
    const html = buildManuscriptHtml(payload);
    const interiorHtml = buildTypesetInteriorHtml(payload, plan);
    const printCss = buildPrintStylesheet(plan);
    const publicationMetadata = buildPublicationProofMetadata({ ready: citationGate.ready && publicationPassGate.ready, proofOnly: citationGate.proofOnly || publicationPassGate.proofOnly, proofNotice: payload.proofNotice, citationStyle: citationGate.citationStyle, ledgerFingerprint: citationGate.ledger?.ledgerFingerprint, bibliography: bibliography.citations });
    const layoutManifest = { ...buildTypesetLayoutManifest(payload, plan), ...publicationMetadata };
    const coverBrief = buildCoverBrief(payload, plan);
    const distributionManifest = { ...buildDistributionManifest(payload, plan), ...publicationMetadata };
    const markdown = buildManuscriptMarkdown(payload);
    const ebookSourceHtml = buildEbookSourceHtml(payload);
    const meta = book.metadataJson as Record<string, unknown> | null;
    const authorName = (meta?.authorName as string) ?? (meta?.authorBioShort as string)?.split(".")[0] ?? "Author";
    const audiobookPackage = { ...buildAudiobookProductionPackage(payload, meta), ...publicationMetadata };
    const audiobookMarkdown = `${citationGate.proofNotice ? `# ${citationGate.proofNotice}\n\n` : ""}${buildAudiobookPackageMarkdown(audiobookPackage)}`;
    const docx = await buildKdpDocx({
      title: payload.title,
      subtitle: payload.subtitle ?? null,
      author: authorName,
      typesetContent: "",
      typesetPlan: plan,
      chapters: payload.chapters.map((chapter) => ({
        title: chapter.chapterLabel,
        body: chapter.chapterText,
      })),
      bibliography: bibliography.citations,
      proofNotice: citationGate.proofNotice,
    });
    const pdf = await buildKdpPdfFromHtml(interiorHtml, plan);
    const includedFiles = [
      `${filenameBase}.docx`,
      `${filenameBase}.html`,
      `${filenameBase}-interior.html`,
      `${filenameBase}-print.css`,
      "layout-manifest.json",
      "cover-brief.json",
      "distribution-manifest.json",
      `${filenameBase}.md`,
      `${filenameBase}.json`,
      `${filenameBase}-ebook-source.html`,
      `${filenameBase}-print.pdf`,
      "bibliography.html",
      "bibliography-report.json",
      "production-manifest.json",
      "audiobook-production-package.json",
      "audiobook-production-package.md",
      "preflight-report.json",
      ...(provenanceVersion?.contentJson ? ["provenance-report.json"] : []),
      ...(marketingVersion?.contentJson ? ["marketing-handoff.json"] : []),
    ];
    const preflightReport = buildTypesetPreflightReport({
      payload,
      plan,
      bibliography: bibliography.report,
      interiorHtml,
      includedFiles,
      pdfRendered: true,
      publicationPassReady: publicationPassGate.ready,
      publicationPassBlockers: publicationPassGate.blockers,
    });

    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, `${filenameBase}.html`), html, "utf8");
    await writeFile(join(bundleDir, `${filenameBase}-interior.html`), interiorHtml, "utf8");
    await writeFile(join(bundleDir, `${filenameBase}-print.css`), printCss, "utf8");
    await writeFile(join(bundleDir, "layout-manifest.json"), JSON.stringify(layoutManifest, null, 2), "utf8");
    await writeFile(join(bundleDir, "cover-brief.json"), JSON.stringify(coverBrief, null, 2), "utf8");
    await writeFile(join(bundleDir, "distribution-manifest.json"), JSON.stringify(distributionManifest, null, 2), "utf8");
    await writeFile(join(bundleDir, `${filenameBase}.md`), markdown, "utf8");
    await writeFile(join(bundleDir, `${filenameBase}.json`), JSON.stringify(payload, null, 2), "utf8");
    await writeFile(join(bundleDir, `${filenameBase}-ebook-source.html`), ebookSourceHtml, "utf8");
    await writeFile(join(bundleDir, `${filenameBase}.docx`), docx);
    await writeFile(join(bundleDir, `${filenameBase}-print.pdf`), pdf);
    await writeFile(join(bundleDir, "bibliography.html"), bibliography.html, "utf8");
    await writeFile(join(bundleDir, "bibliography-report.json"), JSON.stringify(bibliography.report, null, 2), "utf8");
    await writeFile(join(bundleDir, "audiobook-production-package.json"), JSON.stringify(audiobookPackage, null, 2), "utf8");
    await writeFile(join(bundleDir, "audiobook-production-package.md"), audiobookMarkdown, "utf8");
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
          proofOnly: citationGate.proofOnly,
          proofNotice: citationGate.proofNotice,
          printReady: publicationMetadata.printReady,
          ebookReady: publicationMetadata.ebookReady,
          citationLedgerFingerprint: publicationMetadata.citationLedgerFingerprint,
          citationStyle: publicationMetadata.citationStyle,
          bibliography: publicationMetadata.bibliography,
          manuscript: {
            totalWords: payload.totalWords,
            chapterCount: payload.chapterCount,
            draftedChapterCount: payload.draftedChapterCount,
            trimSize: plan.trimSize,
          },
          typesetPlan: plan,
          package: publishingPackage,
          includedFiles,
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      join(bundleDir, "production-manifest.json"),
      JSON.stringify(
        {
          generatedAt: preflightReport.generatedAt,
          ...publicationMetadata,
          title: payload.title,
          subtitle: payload.subtitle ?? null,
          canonicalManuscript: {
            chapterCount: payload.chapterCount,
            totalWords: payload.totalWords,
            chapterKeys: payload.chapters.map((chapter) => chapter.chapterKey),
          },
          typesetPlan: plan,
          bibliography: bibliography.report,
          preflight: {
            status: preflightReport.status,
            checks: preflightReport.checks,
          },
          files: includedFiles,
          exportProfiles: {
            print: {
              docx: `${filenameBase}.docx`,
              pdf: `${filenameBase}-print.pdf`,
              interiorHtml: `${filenameBase}-interior.html`,
              css: `${filenameBase}-print.css`,
            },
            ebook: {
              sourceHtml: `${filenameBase}-ebook-source.html`,
              markdown: `${filenameBase}.md`,
            },
            audio: {
              productionPackageJson: "audiobook-production-package.json",
              productionPackageMarkdown: "audiobook-production-package.md",
              synthesizedAudioIncluded: false,
            },
            data: {
              manuscriptJson: `${filenameBase}.json`,
              layoutManifest: "layout-manifest.json",
              preflightReport: "preflight-report.json",
            },
          },
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
          generatedAt: preflightReport.generatedAt,
          ...publicationMetadata,
          title: payload.title,
          status: preflightReport.status,
          packageStatus: publishingPackage?.packageStatus ?? "draft",
          trimSize: plan.trimSize,
          targetPageCount: publishingPackage?.targetPageCount ?? null,
          preflightChecks: [...preflightReport.checks, ...(publishingPackage?.preflightChecks ?? [])],
          bibliography: {
            sourceCount: bibliography.report.sourceCount,
            incompleteCitationCount: bibliography.report.incompleteCitations.length,
            incompleteCitations: bibliography.report.incompleteCitations,
          },
          typesettingPlan: plan,
          estimatedTotalPages: plan.estimatedTotalPages,
          estimatedSignatureCount: plan.estimatedSignatureCount,
          estimatedBlankPages: plan.estimatedBlankPages,
        },
        null,
        2,
      ),
      "utf8",
    );

    const zipPath = join(tempDir, `${filenameBase}${publicationMetadata.proofOnly ? "-PROOF-ONLY" : ""}-publish-package.zip`);
    await execFileAsync("zip", ["-qjr", zipPath, bundleDir]);
    const zipBuffer = await readFile(zipPath);

    return new Response(new Uint8Array(zipBuffer), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": contentDisposition(`${filenameBase}${publicationMetadata.proofOnly ? "-PROOF-ONLY" : ""}-publish-package.zip`),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export publish package.";
    const status =
      /required before manuscript export|No chapter drafts exist yet|PUBLICATION_(?:CITATION|PASS)_BLOCKED/i.test(message) ? 409 : 500;
    return new Response(message, { status });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
