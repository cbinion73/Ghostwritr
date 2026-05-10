import { getDefaultBookWorkspaceHref } from "@/lib/workflow-registry";
import { importBookArchiveBuffer } from "@/lib/book-archive-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("archive");

    if (!(file instanceof File) || file.size === 0) {
      return new Response("Archive file is required.", { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const imported = await importBookArchiveBuffer({
      bytes,
      fileName: file.name,
    });

    return Response.redirect(
      new URL(getDefaultBookWorkspaceHref(imported.workflowType, imported.slug), request.url),
      303,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import book archive.";
    return new Response(message, { status: 500 });
  }
}
