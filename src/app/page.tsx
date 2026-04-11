import Link from "next/link";

import { createBookAction, deleteBookAction } from "./actions";

import { listBooks } from "@/lib/repositories/books";

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

export default async function HomePage() {
  const books = await listBooks();

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
                New books open directly into the Promise stage so you can begin shaping
                the concept immediately.
              </div>
            </div>

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
              <button className="btn btn-primary" type="submit">
                Create Book
              </button>
            </form>
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
                    <div className="chapter-list-header">
                      <div>
                        <strong>{book.titleWorking ?? "Untitled Book"}</strong>
                        <div className="muted" style={{ marginTop: 6 }}>
                          {book.subtitle || book.slug}
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

                    <div className="button-row" style={{ marginTop: 14 }}>
                      <Link className="btn" href={`/books/${book.slug}/promise`}>
                        Open Book
                      </Link>
                      <Link className="btn" href={`/books/${book.slug}/outline`}>
                        Open Outline
                      </Link>
                      <Link className="btn" href={`/books/${book.slug}/chapter-draft`}>
                        Open Draft
                      </Link>
                      <form action={deleteBookAction}>
                        <input name="slug" type="hidden" value={book.slug} />
                        <button className="btn" type="submit">
                          Delete
                        </button>
                      </form>
                    </div>
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
