import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { getPromiseWorkspace } from "@/lib/workflows/promise-public";
import {
  buildBookPitchExportHtml,
  sanitizeBookPitchFilename,
  type BookPitchExportFormat,
} from "@/lib/book-pitch-document";

const execFileAsync = promisify(execFile);

export const runtime = "nodejs";

function contentDisposition(filename: string): string {
  return `attachment; filename="${filename}"`;
}

async function convertHtmlToDocx(html: string, filenameBase: string): Promise<Buffer> {
  const tempDir = await mkdtemp(join(tmpdir(), "ghostwritr-book-pitch-"));
  const htmlPath = join(tempDir, `${filenameBase}.html`);
  const docxPath = join(tempDir, `${filenameBase}.docx`);

  try {
    await writeFile(htmlPath, html, "utf8");
    // `textutil` is macOS-only and doesn't exist on the Linux production
    // container — confirmed live, this silently failed every docx export.
    // pandoc does the same html->docx conversion and is cross-platform.
    await execFileAsync("pandoc", [htmlPath, "-o", docxPath]);
    return await readFile(docxPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const user = await requireAuthenticatedAppUser();
  await getBookHeaderBySlugForUserOrThrow(slug, user.id);

  const workspace = await getPromiseWorkspace(slug);
  const report = workspace.bookPromiseReport;

  if (!report?.documentMarkdown) {
    return new Response("Book Pitch package has not been generated yet.", {
      status: 404,
    });
  }

  const filenameBase = sanitizeBookPitchFilename(report.title || workspace.promiseBrief.workingTitle);
  const url = new URL(_request.url);
  const format = (url.searchParams.get("format") || "docx") as BookPitchExportFormat;

  if (format === "markdown") {
    return new Response(report.documentMarkdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": contentDisposition(`${filenameBase}.md`),
      },
    });
  }

  if (format === "json") {
    return new Response(JSON.stringify(report, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": contentDisposition(`${filenameBase}.json`),
      },
    });
  }

  const html = buildBookPitchExportHtml({
    title: report.title,
    subtitle: report.subtitle,
    executiveSummary: report.executiveSummary,
    recommendation: report.recommendation,
    markdown: report.documentMarkdown,
  });

  if (format === "html") {
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": contentDisposition(`${filenameBase}.html`),
      },
    });
  }

  if (format === "docx") {
    try {
      const docx = await convertHtmlToDocx(html, filenameBase);
      return new Response(new Uint8Array(docx), {
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": contentDisposition(`${filenameBase}.docx`),
        },
      });
    } catch (error) {
      return new Response(
        error instanceof Error ? error.message : "Failed to generate Word export.",
        { status: 500 },
      );
    }
  }

  return new Response(`Unsupported export format: ${format}`, { status: 400 });
}
