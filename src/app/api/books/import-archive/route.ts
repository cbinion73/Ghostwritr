import { getDefaultBookWorkspaceHref } from "@/lib/workflow-registry";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { importBookArchiveBuffer } from "@/lib/book-archive-import";
import {
  REQUEST_LIMITS,
  RequestLimitError,
  assertContentLengthWithinLimit,
  assertFileWithinLimit,
  requestLimitResponse,
} from "@/lib/request-limits";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedAppUser();
    assertContentLengthWithinLimit(request, REQUEST_LIMITS.archiveBytes, "Archive import");
    const formData = await request.formData();
    const file = formData.get("archive");

    if (!(file instanceof File) || file.size === 0) {
      return new Response("Archive file is required.", { status: 400 });
    }
    assertFileWithinLimit(file, REQUEST_LIMITS.archiveBytes, "Archive import");

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > REQUEST_LIMITS.expandedArchiveBytes) {
      return new Response("Archive exceeds the expanded archive processing limit.", { status: 413 });
    }
    const imported = await importBookArchiveBuffer({
      bytes,
      fileName: file.name,
      ownerUserId: user.id,
    });

    return Response.redirect(
      new URL(getDefaultBookWorkspaceHref(imported.workflowType, imported.slug), request.url),
      303,
    );
  } catch (error) {
    if (error instanceof RequestLimitError) return requestLimitResponse(error);
    const message =
      error instanceof Error ? error.message : "Failed to import book archive.";
    return new Response(message, { status: 500 });
  }
}
