import { archiveContentDisposition, createBookArchive } from "@/lib/book-archive-export";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookHeaderBySlugForUserOrThrow } from "@/lib/repositories/books";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<unknown> },
) {
  try {
    const { slug } = (await context.params) as { slug: string };
    const user = await requireAuthenticatedAppUser();
    await getBookHeaderBySlugForUserOrThrow(slug, user.id);

    const archive = await createBookArchive(slug);

    return new Response(new Uint8Array(archive.bytes), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": archiveContentDisposition(archive.filename),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to export book archive.";
    const status = /book not found/i.test(message) ? 404 : 500;
    return new Response(message, { status });
  }
}
