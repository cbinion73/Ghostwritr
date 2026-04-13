import Link from "next/link";

import { toggleBookFileAction, uploadBookFileAction } from "./actions";

import { getOrCreateBookBySlug } from "@/lib/repositories/books";
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
  const book = await getOrCreateBookBySlug(slug);
  const files = await listBookSourceDocuments({ bookId: book.id });

  return (
    <div className="page-shell">
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
          <Link href="/" className="stage-chip">
            Library
          </Link>
          <Link href={`/books/${slug}/promise`} className="stage-chip active">
            Back To Promise
          </Link>
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
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <h3>Upload Files</h3>
            <div className="muted">
              Upload reference documents, outlines, research, or other source material to inform the Promise generation.
            </div>
          </div>

          <form action={uploadBookFileAction.bind(null, slug)} style={{ display: "grid", gap: "16px", padding: "20px", backgroundColor: "rgba(255, 255, 255, 0.3)", borderRadius: "6px", marginBottom: "32px" }}>
            <div style={{ display: "grid", gap: "8px" }}>
              <label style={{ fontSize: "14px", fontWeight: 500, color: "#2d241d" }}>
                Select File
              </label>
              <input
                type="file"
                name="file"
                required
                style={{
                  padding: "12px",
                  border: "1px solid rgba(45, 36, 29, 0.2)",
                  borderRadius: "6px",
                  fontSize: "14px",
                  color: "#2d241d",
                  backgroundColor: "white",
                  cursor: "pointer",
                }}
              />
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              <label style={{ fontSize: "14px", fontWeight: 500, color: "#2d241d" }}>
                Optional Note
              </label>
              <textarea
                name="note"
                placeholder="Add a note about this document (optional)"
                style={{
                  padding: "12px",
                  border: "1px solid rgba(45, 36, 29, 0.2)",
                  borderRadius: "6px",
                  fontSize: "14px",
                  color: "#2d241d",
                  fontFamily: "inherit",
                  minHeight: "80px",
                  resize: "vertical",
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                padding: "12px 16px",
                backgroundColor: "#16384f",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "opacity 0.2s",
              }}
            >
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
  );
}
