import Link from "next/link";
import { BookWorkflowType } from "@prisma/client";

import { cloneBookAction, createBookAction, createBookWithWizardAction, deleteBookAction } from "./actions";

import { listBooks } from "@/lib/repositories/books";
import { getCurrentEditingArtifactVersionIdsForBooks } from "@/lib/repositories/editing-artifacts";
import { getDefaultBookWorkspaceHref } from "@/lib/workflow-registry";
import { buildPublishPackageSyncState } from "@/lib/publish-sync";

export const dynamic = "force-dynamic";

function getStageSummary(
  stages: Array<{ stageKey: string; status: string }>,
) {
  const active =
    stages.find((stage) => stage.status === "IN_PROGRESS") ??
    stages.find((stage) => stage.status === "BLOCKED") ??
    stages.find((stage) => stage.status === "READY_FOR_REVIEW") ??
    stages.find((stage) => stage.status === "COMMITTED") ??
    stages[0];

  return active ? `${active.stageKey.replace(/_/g, " ")} • ${active.status.replace(/_/g, " ")}` : "No stages yet";
}

function parseMetadataRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function getWorkflowProgress(stages: Array<{ status: string }>) {
  if (stages.length === 0) {
    return "0%";
  }

  const committed = stages.filter((stage) => stage.status === "COMMITTED").length;
  return `${Math.round((committed / stages.length) * 100)}%`;
}

function getBlockerLabel(stages: Array<{ stageKey: string; status: string }>) {
  const blocked = stages.find((stage) => stage.status === "BLOCKED");
  if (blocked) {
    return blocked.stageKey.replace(/_/g, " ");
  }

  const review = stages.find((stage) => stage.status === "READY_FOR_REVIEW");
  if (review) {
    return `${review.stageKey.replace(/_/g, " ")} review`;
  }

  const progress = stages.find((stage) => stage.status === "IN_PROGRESS");
  if (progress) {
    return `${progress.stageKey.replace(/_/g, " ")} in progress`;
  }

  return "No blocker";
}

export default async function HomePage() {
  const books = await listBooks();
  const editingArtifactVersionIds = await getCurrentEditingArtifactVersionIdsForBooks(
    books.map((book) => book.id),
    ["MANUSCRIPT_ASSEMBLY", "PUBLISHING_PACKAGE"],
  );

  return (
    <div className="page-shell library-shell">
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Start a new book, reopen an active one, or clear out old projects from one
            calm library view.
          </p>
        </div>

        <div className="card">
          <div className="label">Library</div>
          <h3 style={{ marginTop: 6 }}>Book Workspace</h3>
          <div className="muted">
            Each book keeps its own Promise, Outline, dossiers, stories, and manuscript
            flow so you can move between projects cleanly.
          </div>
        </div>
      </aside>

      <main className="main-column">
        <section className="glass-panel topbar">
          <div>
            <div className="label">Opening Area</div>
            <h2>Book Library</h2>
            <div className="muted">
              Create a new book, jump back into an existing one, or remove a project you
              no longer need.
            </div>
          </div>
        </section>

        <section className="workspace-grid" style={{ gridTemplateColumns: "1.1fr 1.4fr" }}>
          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>Start A New Book</h3>
              <div className="muted">
                Create a book and set up basic metadata, or jump straight into the
                Promise Wizard to define your book's core concept.
              </div>
            </div>

            <div className="stack">
              <div>
                <div className="label" style={{ marginBottom: 8 }}>With Setup First</div>
                <form action={createBookAction} className="stack">
                  <input
                    className="editor-input"
                    name="titleWorking"
                    placeholder="Working title"
                    type="text"
                  />
                  <input
                    className="editor-input"
                    name="subtitle"
                    placeholder="Subtitle (optional)"
                    type="text"
                  />
                  <select className="editor-input" name="workflowType" defaultValue={BookWorkflowType.NONFICTION}>
                    <option value={BookWorkflowType.NONFICTION}>Nonfiction workflow</option>
                    <option value={BookWorkflowType.FICTION}>Fiction workflow</option>
                  </select>
                  <button className="btn btn-primary" type="submit">
                    Create Book & Setup
                  </button>
                </form>
              </div>

              <div style={{ borderTop: "1px solid rgba(45, 36, 29, 0.1)", paddingTop: 16, marginTop: 16 }}>
                <div className="label" style={{ marginBottom: 8 }}>Or Jump to Wizard</div>
                <form action={createBookWithWizardAction} className="stack">
                  <input
                    className="editor-input"
                    name="titleWorking"
                    placeholder="Working title"
                    type="text"
                    required
                  />
                  <select className="editor-input" name="workflowType" defaultValue={BookWorkflowType.NONFICTION}>
                    <option value={BookWorkflowType.NONFICTION}>Nonfiction workflow</option>
                    <option value={BookWorkflowType.FICTION}>Fiction workflow</option>
                  </select>
                  <button className="btn" type="submit">
                    Start Workflow ✨
                  </button>
                </form>
              </div>

              <div style={{ borderTop: "1px solid rgba(45, 36, 29, 0.1)", paddingTop: 16, marginTop: 16 }}>
                <div className="label" style={{ marginBottom: 8 }}>Restore From Archive</div>
                <form action="/api/books/import-archive" className="stack" method="post" encType="multipart/form-data">
                  <input
                    className="editor-input"
                    name="archive"
                    accept=".zip,application/zip"
                    type="file"
                    required
                  />
                  <button className="btn" type="submit">
                    Import Book Archive
                  </button>
                </form>
              </div>
            </div>
          </section>

          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>Existing Books</h3>
              <div className="muted">
                Switch between books from here instead of editing URLs by hand.
              </div>
            </div>

            <div className="stack">
              {books.length > 0 ? (
                books.map((book) => (
                  <article className="card" key={book.id}>
                    {(() => {
                      const metadata = parseMetadataRecord(book.metadataJson);
                      const automation =
                        metadata.workflowAutomation && typeof metadata.workflowAutomation === "object"
                          ? (metadata.workflowAutomation as {
                              mode?: string;
                              enabled?: boolean;
                              lastSummary?: { title?: string };
                            })
                          : null;
                      const editingStage = book.stages.find(
                        (stage) => String(stage.stageKey) === "EDITING",
                      );
                      const editingStageMetadata = parseMetadataRecord(editingStage?.metadataJson);
                      const versionIds = editingArtifactVersionIds.get(book.id) ?? {};
                      const publishSyncState = buildPublishPackageSyncState({
                        currentAssemblyVersionId: versionIds.MANUSCRIPT_ASSEMBLY ?? null,
                        hasPublishingPackage: Boolean(versionIds.PUBLISHING_PACKAGE),
                        packageSourceAssemblyVersionId:
                          typeof editingStageMetadata.publishPackageSourceAssemblyVersionId === "string"
                            ? editingStageMetadata.publishPackageSourceAssemblyVersionId
                            : null,
                        lastRefreshedAt:
                          typeof editingStageMetadata.publishPackageRefreshedAt === "string"
                            ? editingStageMetadata.publishPackageRefreshedAt
                            : null,
                      });
                      const publishReady = book.stages.some((stage) => String(stage.stageKey) === "EDITING" && String(stage.status) === "COMMITTED");
                      const finalizedAt =
                        typeof editingStageMetadata.finalHandoffState === "object" &&
                        editingStageMetadata.finalHandoffState &&
                        "finalizedAt" in editingStageMetadata.finalHandoffState &&
                        typeof editingStageMetadata.finalHandoffState.finalizedAt === "string"
                          ? editingStageMetadata.finalHandoffState.finalizedAt
                          : null;
                      const progress = getWorkflowProgress(
                        book.stages.map((stage) => ({
                          status: String(stage.status),
                        })),
                      );
                      const blocker = getBlockerLabel(
                        book.stages.map((stage) => ({
                          stageKey: String(stage.stageKey),
                          status: String(stage.status),
                        })),
                      );

                      return (
                        <>
                    <div className="chapter-list-header">
                      <div>
                        <strong>{book.titleWorking ?? "Untitled Book"}</strong>
                        <div className="muted" style={{ marginTop: 6 }}>
                          {book.subtitle || book.slug}
                        </div>
                        <div className="muted" style={{ marginTop: 6 }}>
                          {book.workflowType === BookWorkflowType.FICTION ? "Fiction workflow" : "Nonfiction workflow"}
                        </div>
                        <div className="muted" style={{ marginTop: 6 }}>
                          Progress: {progress} • Automation: {(automation?.mode ?? "manual").replace(/_/g, " ")}
                        </div>
                        <div className="muted" style={{ marginTop: 6 }}>
                          Next constraint: {blocker}
                        </div>
                      </div>
                      <span className="binder-status status-draft">
                        {getStageSummary(
                          book.stages.map((stage) => ({
                            stageKey: String(stage.stageKey),
                            status: String(stage.status),
                          })),
                        )}
                      </span>
                    </div>

                    <div className="pill-row" style={{ marginTop: 12 }}>
                      <div className="pill">Publish {publishReady ? "ready" : "not ready"}</div>
                      <div className="pill">
                        Publish {publishSyncState.status === "synced"
                          ? "synced"
                          : publishSyncState.status === "stale"
                            ? "refresh required"
                            : "package missing"}
                      </div>
                      <div className="pill">
                        {finalizedAt ? `Finalized ${new Date(finalizedAt).toLocaleDateString()}` : "Handoff not finalized"}
                      </div>
                      <div className="pill">
                        {automation?.lastSummary?.title ?? "No automation summary yet"}
                      </div>
                    </div>
                    <div className="muted" style={{ marginTop: 8 }}>
                      Publish handoff: {publishSyncState.detail}
                    </div>

                    <div className="button-row" style={{ marginTop: 14 }}>
                      <Link
                        className="btn"
                        href={getDefaultBookWorkspaceHref(
                          book.workflowType,
                          book.slug,
                          book.stages.find((stage) => stage.status === "IN_PROGRESS")?.stageKey ?? null,
                        )}
                      >
                        Open Book
                      </Link>
                      {book.workflowType === BookWorkflowType.NONFICTION ? (
                        <>
                          <Link className="btn" href={`/books/${book.slug}/outline`}>
                            Open Outline
                          </Link>
                          <Link className="btn" href={`/books/${book.slug}/chapter-draft`}>
                            Open Draft
                          </Link>
                          <Link className="btn" href={`/books/${book.slug}/promise?wizard=true`} title="Restart the Promise Wizard">
                            Restart Wizard
                          </Link>
                        </>
                      ) : (
                        <>
                          <Link className="btn" href={`/books/${book.slug}/plot-blueprint`}>
                            Open Plot
                          </Link>
                          <Link className="btn" href={`/books/${book.slug}/draft`}>
                            Open Draft
                          </Link>
                        </>
                      )}
                      <form action={deleteBookAction}>
                        <input name="slug" type="hidden" value={book.slug} />
                        <button className="btn" type="submit">
                          Delete
                        </button>
                      </form>
                      <form action={cloneBookAction}>
                        <input name="slug" type="hidden" value={book.slug} />
                        <button className="btn" type="submit">
                          Branch Book
                        </button>
                      </form>
                      <Link className="btn" href={`/api/books/${book.slug}/archive`}>
                        Export Archive
                      </Link>
                    </div>
                        </>
                      );
                    })()}
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  No books yet. Create your first one from the panel on the left.
                </div>
              )}
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
