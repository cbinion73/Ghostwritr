import Link from "next/link";

import { toggleBookFileAction, uploadBookFileAction } from "./actions";
import { AppTopBar } from "@/app/components/app-top-bar";
import { getBookStageLinks } from "@/lib/navigation";

import { getBookBySlugOrThrow } from "@/lib/repositories/books";
import { listBookSourceDocuments } from "@/lib/repositories/source-documents";

function getStageLabel(stageKey: string | null) {
  if (stageKey === "PROMISE") {
    return "Promise";
  }

  if (stageKey === "BOOK_SETUP") {
    return "Book Setup";
  }

  return stageKey ?? "General";
}

export default async function BookFilesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const book = await getBookBySlugOrThrow(slug);
  const files = await listBookSourceDocuments({ bookId: book.id });
  const stageLinks = getBookStageLinks(book.workflowType, slug);

  return (
    <div className="dark-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppTopBar bookSlug={slug} bookTitle={book.titleWorking ?? undefined} activePage="studio" />
      <div className="page-shell" style={{ flex: 1 }}>
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            A central folder for the book’s uploaded source material and multimodal inputs.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Files: <strong>{files.length}</strong>
          </div>
        </div>

        <div className="stage-list">
          <Link href="/" className="stage-chip">← Library</Link>
          {stageLinks.map((stage) => (
            <Link key={stage.key} href={stage.href} className="stage-chip">
              {stage.label}
            </Link>
          ))}
        </div>
      </aside>

      <main className="main-column">
        <section className="glass-panel topbar">
          <div>
            <div className="label">Book Workspace</div>
            <h2>File Folder</h2>
            <div className="muted">
              Review uploaded materials and decide which ones are active inputs for the book.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link className="btn" href={`/books/${slug}`}>← Book Studio</Link>
          </div>
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <h3>Upload Files</h3>
            <div className="muted">
              Upload reference documents, outlines, research, or other source material to inform the Promise generation.
            </div>
          </div>

          <form action={uploadBookFileAction.bind(null, slug)} style={{ display: "grid", gap: "16px", padding: "20px", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: "6px", marginBottom: "32px" }}>
            <div style={{ display: "grid", gap: "8px" }}>
              <label style={{ fontSize: "14px", fontWeight: 500, color: "#e8d5b0" }}>
                Select File
              </label>
              <input
                type="file"
                name="file"
                required
                style={{
                  padding: "12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "6px",
                  fontSize: "14px",
                  color: "#e8d5b0",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  cursor: "pointer",
                }}
              />
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              <label style={{ fontSize: "14px", fontWeight: 500, color: "#e8d5b0" }}>
                Optional Note
              </label>
              <textarea
                name="note"
                placeholder="Add a note about this document (optional)"
                style={{
                  padding: "12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "6px",
                  fontSize: "14px",
                  color: "#e8d5b0",
                  fontFamily: "inherit",
                  minHeight: "80px",
                  resize: "vertical",
                  background: "rgba(255,255,255,0.05)",
                }}
              />
            </div>
            <button type="submit" className="btn">
              Upload File
            </button>
          </form>

          <div className="section-header">
            <h3>Uploaded Files</h3>
            <div className="muted">
              Turning a file off keeps it in the project but removes it from active Promise context.
            </div>
          </div>

          {files.length > 0 ? (
            <div className="version-list">
              {files.map((file) => {
                const metadata =
                  file.metadataJson && typeof file.metadataJson === "object"
                    ? (file.metadataJson as Record<string, unknown>)
                    : {};
                const stageKey =
                  typeof metadata.stageKey === "string" ? metadata.stageKey : null;
                const note = typeof metadata.note === "string" ? metadata.note : "";
                const enabled =
                  typeof metadata.enabled === "boolean" ? metadata.enabled : true;

                return (
                  <div className="version-item" key={file.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <strong>{file.title}</strong>
                      <span className="muted">{file.mimeType}</span>
                    </div>
                    <div className="pill-row" style={{ marginTop: 10 }}>
                      <div className="pill">{getStageLabel(stageKey)}</div>
                      <div className={`pill ${enabled ? "" : "pill-muted"}`}>
                        {enabled ? "Active" : "Inactive"}
                      </div>
                    </div>
                    {note ? (
                      <div className="muted" style={{ marginTop: 10, lineHeight: 1.6 }}>
                        {note}
                      </div>
                    ) : null}
                    <div className="muted" style={{ marginTop: 10, fontSize: "0.88rem" }}>
                      {file.storagePath}
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <form action={toggleBookFileAction.bind(null, slug, file.id, !enabled)}>
                        <button className="btn" type="submit">
                          {enabled ? "Turn Off For Book" : "Turn On For Book"}
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">No files have been uploaded for this book yet.</div>
          )}
        </section>
      </main>
      </div>
    </div>
  );
}
