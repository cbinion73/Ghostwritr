import Link from "next/link";
import { BookWorkflowType } from "@prisma/client";

import { createBookAction } from "./actions";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { listBooksForUserWithParent } from "@/lib/repositories/books";
import { AppTopBar } from "./components/app-top-bar";
import { Bookshelf, type ShelfBook } from "./bookshelf";
import styles from "./library-page.module.css";

export const dynamic = "force-dynamic";

function getProgress(stages: Array<{ status: string }>) {
  if (stages.length === 0) return 0;
  const committed = stages.filter((stage) => stage.status === "COMMITTED").length;
  return Math.round((committed / stages.length) * 100);
}

function getActiveStageLabel(stages: Array<{ stageKey: string; status: string }>) {
  const active =
    stages.find((stage) => stage.status === "IN_PROGRESS") ??
    stages.find((stage) => stage.status === "READY_FOR_REVIEW") ??
    stages.find((stage) => stage.status === "BLOCKED");
  if (!active) {
    const committed = [...stages].reverse().find((stage) => stage.status === "COMMITTED");
    return committed ? committed.stageKey.replace(/_/g, " ") : "Not started";
  }
  return active.stageKey.replace(/_/g, " ");
}

type BookWithStages = Awaited<ReturnType<typeof listBooksForUserWithParent>>[number];

function toShelfBook(book: BookWithStages): ShelfBook {
  const stages = book.stages.map((stage) => ({ stageKey: String(stage.stageKey), status: String(stage.status) }));
  const isWorkbook = book.workflowType === BookWorkflowType.WORKBOOK;
  return {
    slug: book.slug,
    title: book.titleWorking ?? "Untitled Book",
    subtitle: book.subtitle,
    workflowLabel: isWorkbook
      ? "Workbook"
      : book.workflowType === BookWorkflowType.FICTION
        ? "Fiction"
        : "Nonfiction",
    pct: getProgress(stages),
    activeLabel: getActiveStageLabel(stages),
    coverImageUrl: book.coverImageUrl,
  };
}

export default async function HomePage() {
  const user = await requireAuthenticatedAppUser();
  const allBooks = await listBooksForUserWithParent(user.id);
  const books = allBooks.filter((book) => !book.isArchived);
  const archivedBooks = allBooks.filter((book) => book.isArchived);

  return (
    <div className={styles.page}>
      <AppTopBar activePage="library" />
      <div className={styles.ambient} aria-hidden />

      <main className={styles.main}>
        <header className={styles.hero}>
          <div>
            <div className={styles.kicker}><span /> The private press</div>
            <h1>Your library</h1>
            <p>
              Every idea begins as a blank page. Every finished book earns its place on the shelf.
            </p>
          </div>
          <div className={styles.collectionCount} aria-label={`${books.length} active books`}>
            <strong>{String(books.length).padStart(2, "0")}</strong>
            <span>volume{books.length === 1 ? "" : "s"}<br />in progress</span>
          </div>
        </header>

        <div className={styles.layout}>
          <aside className={styles.commission}>
            <div className={styles.folioTop}>
              <span className={styles.monogram}>GW</span>
              <div>
                <span className={styles.label}>Commission a new volume</span>
                <h2>What will you write next?</h2>
              </div>
            </div>
            <p className={styles.invitation}>
              Name the idea. Ghostwritr will open a private studio and guide it from first promise to press-ready pages.
            </p>
            <form action={createBookAction} className={styles.form}>
              <label>
                <span>Working title</span>
                <input name="titleWorking" type="text" placeholder="The title can change" autoComplete="off" />
              </label>
              <label>
                <span>Subtitle</span>
                <input name="subtitle" type="text" placeholder="Optional" autoComplete="off" />
              </label>
              <label>
                <span>Kind of book</span>
                <select name="workflowType" defaultValue={BookWorkflowType.NONFICTION}>
                  <option value={BookWorkflowType.NONFICTION}>Nonfiction</option>
                  <option value={BookWorkflowType.FICTION}>Fiction</option>
                </select>
              </label>
              <button type="submit"><span>Create the book</span><b>→</b></button>
            </form>
            <Link href="/ideas" className={styles.ideaLink}>Not ready yet? Visit the idea cabinet →</Link>
            <div className={styles.folioNumber}>GHOSTWRITR · PRIVATE EDITION</div>
          </aside>

          <section className={styles.stacks} aria-labelledby="collection-title">
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.label}>The collection</span>
                <h2 id="collection-title">Books in the making</h2>
              </div>
              <span className={styles.sectionNote}>Select a volume to enter its studio</span>
            </div>

            {books.length === 0 && archivedBooks.length === 0 ? (
              <div className={styles.empty}>
                <span>✦</span>
                <h2>The first shelf is waiting.</h2>
                <p>Commission your first volume and begin with the promise your book will make to its reader.</p>
              </div>
            ) : (
              <Bookshelf books={books.map(toShelfBook)} archived={archivedBooks.map(toShelfBook)} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
