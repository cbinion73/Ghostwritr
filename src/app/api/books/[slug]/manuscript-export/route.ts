import {
  buildManuscriptHtml,
  buildManuscriptMarkdown,
  sanitizeManuscriptFilename,
  type ManuscriptExportFormat,
} from "@/lib/manuscript-document";
import {
  buildManuscriptExportPayload,
  contentDisposition,
  convertHtmlToDocx,
} from "@/lib/manuscript-export";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";
import { requirePublicationCitationReady } from "@/lib/publication-citation-gate";
import { requirePublicationPassReady } from "@/lib/publication-pass-gate";
import { generateBibliography } from "@/lib/workflows/bibliography-generator";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    const user = await requireAuthenticatedAppUser();
    const book = await getBookHeaderBySlugForUserOrThrow(slug, user.id);
    const url = new URL(request.url);
    const citationGate = await requirePublicationCitationReady(book.id, url.searchParams.get("mode") === "proof");
    const publicationPassGate = await requirePublicationPassReady(book.id, url.searchParams.get("mode") === "proof");

    const payload = await buildManuscriptExportPayload(slug);
    const bibliography = citationGate.ledger ? await generateBibliography(book.id, payload.title) : null;
    payload.bibliography = bibliography?.citations ?? [];
    payload.proofNotice = [citationGate.proofNotice, publicationPassGate.proofNotice].filter(Boolean).join(" · ") || null;
    const filenameBase = sanitizeManuscriptFilename(payload.title);
    const format = (url.searchParams.get("format") || "docx") as ManuscriptExportFormat;

    if (format === "markdown") {
      return new Response(buildManuscriptMarkdown(payload), {
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": contentDisposition(`${filenameBase}.md`),
        },
      });
    }

    if (format === "json") {
      return new Response(JSON.stringify(payload, null, 2), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": contentDisposition(`${filenameBase}.json`),
        },
      });
    }

    const html = buildManuscriptHtml(payload);

    if (format === "html") {
      return new Response(html, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": contentDisposition(`${filenameBase}.html`),
        },
      });
    }

    if (format === "docx") {
      const docx = await convertHtmlToDocx(html, filenameBase);
      return new Response(new Uint8Array(docx), {
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-disposition": contentDisposition(`${filenameBase}.docx`),
        },
      });
    }

    return new Response(`Unsupported export format: ${format}`, { status: 400 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export manuscript.";
    const status =
      /required before manuscript export|No chapter drafts exist yet|PUBLICATION_(?:CITATION|PASS)_BLOCKED/i.test(message) ? 409 : 500;
    return new Response(
      message,
      { status },
    );
  }
}
