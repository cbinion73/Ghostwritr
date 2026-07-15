"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  archiveBookAction,
  deleteBookAction,
  removeBookCoverAction,
  restoreBookAction,
  uploadBookCoverAction,
} from "./actions";
import styles from "./bookshelf.module.css";
import { getCoverUploadError } from "@/lib/cover-upload-policy";

export type ShelfBook = {
  slug: string;
  title: string;
  subtitle: string | null;
  workflowLabel: string;
  pct: number;
  activeLabel: string;
  coverImageUrl?: string | null;
};

type Binding = {
  base: string;
  shade: string;
  foil: string;
  texture: string;
  ornament: "frame" | "rules" | "medallion" | "minimal";
};

const BINDINGS: Binding[] = [
  { base: "#6b2130", shade: "#2a0b12", foil: "#e2c17c", texture: "/textures/leather-burgundy.jpg", ornament: "frame" },
  { base: "#183f31", shade: "#071d16", foil: "#e1c47d", texture: "/textures/leather-forest.jpg", ornament: "medallion" },
  { base: "#1d3152", shade: "#091426", foil: "#eadfbf", texture: "/textures/cloth-navy.jpg", ornament: "rules" },
  { base: "#3d2345", shade: "#160b1c", foil: "#dbc07b", texture: "/textures/leather-plum.jpg", ornament: "frame" },
  { base: "#27282e", shade: "#0c0d10", foil: "#d5d0c4", texture: "/textures/cloth-charcoal.jpg", ornament: "minimal" },
  { base: "#76612f", shade: "#2b220d", foil: "#f1e1b7", texture: "/textures/cloth-olive.jpg", ornament: "rules" },
  { base: "#d4c5a5", shade: "#786b50", foil: "#3c2f20", texture: "/textures/cloth-cream.jpg", ornament: "frame" },
  { base: "#8a4628", shade: "#34170c", foil: "#f1d49a", texture: "/textures/leather-rust.jpg", ornament: "medallion" },
];

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function bindingFor(book: ShelfBook) {
  return BINDINGS[hash(book.slug) % BINDINGS.length];
}

function chapterLabel(book: ShelfBook) {
  if (book.pct === 100) return "Complete edition";
  if (book.pct === 0) return "A new volume";
  return `${book.pct}% of the journey`;
}

function BookCover({ book }: { book: ShelfBook }) {
  const binding = bindingFor(book);
  const titleSize = book.title.length > 42 ? "small" : book.title.length > 24 ? "medium" : "large";

  return (
    <span
      className={styles.book}
      style={{
        "--binding": binding.base,
        "--binding-shadow": binding.shade,
        "--foil": binding.foil,
        "--texture": `url(${binding.texture})`,
      } as React.CSSProperties}
    >
      <span className={styles.pageBlock} aria-hidden />
      <span className={styles.spineEdge} aria-hidden />
      <span className={styles.cover}>
        {book.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.coverArtwork} src={book.coverImageUrl} alt="" draggable={false} />
        ) : (
          <>
            <span className={`${styles.ornament} ${styles[binding.ornament]}`} aria-hidden>
              <span>GW</span>
            </span>
            <span className={styles.imprint}>A GHOSTWRITR MANUSCRIPT</span>
            <span className={`${styles.coverTitle} ${styles[titleSize]}`}>{book.title}</span>
            {book.subtitle ? <span className={styles.coverSubtitle}>{book.subtitle}</span> : null}
            <span className={styles.coverMark} aria-hidden>✦</span>
          </>
        )}
        <span className={styles.coverLight} aria-hidden />
      </span>
      <span className={styles.bookmark} style={{ "--progress": `${book.pct}%` } as React.CSSProperties}>
        <span>{book.pct}%</span>
      </span>
    </span>
  );
}

function BookActions({ book }: { book: ShelfBook }) {
  const coverFormRef = useRef<HTMLFormElement>(null);
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.actions}>
      <form ref={coverFormRef} action={uploadBookCoverAction}>
        <input name="slug" type="hidden" value={book.slug} />
        <input
          ref={coverFileInputRef}
          name="cover"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className={styles.hiddenInput}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (!file) return;
            const uploadError = getCoverUploadError(file);
            if (uploadError) {
              window.alert(uploadError);
              event.currentTarget.value = "";
              return;
            }
            coverFormRef.current?.requestSubmit();
          }}
        />
        <button type="button" onClick={() => coverFileInputRef.current?.click()}>
          {book.coverImageUrl ? "Replace cover" : "Add cover"}
        </button>
      </form>
      {book.coverImageUrl ? (
        <form action={removeBookCoverAction}>
          <input name="slug" type="hidden" value={book.slug} />
          <button type="submit">Use studio binding</button>
        </form>
      ) : null}
      <form action={archiveBookAction}>
        <input name="slug" type="hidden" value={book.slug} />
        <button type="submit">Archive</button>
      </form>
      <form action={deleteBookAction}>
        <input name="slug" type="hidden" value={book.slug} />
        <button
          type="submit"
          className={styles.danger}
          onClick={(event) => {
            if (!window.confirm(`Delete "${book.title}" permanently?`)) event.preventDefault();
          }}
        >
          Discard
        </button>
      </form>
    </div>
  );
}

export function Bookshelf({ books, archived = [] }: { books: ShelfBook[]; archived?: ShelfBook[] }) {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  function openBook(slug: string) {
    if (opening) return;
    setOpening(slug);
    window.setTimeout(() => router.push(`/books/${slug}`), 460);
  }

  return (
    <div className={styles.library}>
      <div className={styles.roomGlow} aria-hidden />
      <div className={styles.collection}>
        {books.map((book, index) => (
          <article
            className={`${styles.volume} ${opening === book.slug ? styles.opening : ""}`}
            style={{ "--stagger": `${Math.min(index, 10) * 45}ms` } as React.CSSProperties}
            key={book.slug}
          >
            <button className={styles.bookButton} onClick={() => openBook(book.slug)} aria-label={`Open ${book.title}`}>
              <BookCover book={book} />
            </button>
            <div className={styles.catalogueCard}>
              <div className={styles.eyebrow}>{book.workflowLabel} · {chapterLabel(book)}</div>
              <h2>{book.title}</h2>
              <p>{book.activeLabel}</p>
              <div className={styles.progressTrack} aria-label={`${book.pct}% complete`}>
                <span style={{ width: `${book.pct}%` }} />
              </div>
              <BookActions book={book} />
            </div>
          </article>
        ))}
      </div>

      {archived.length > 0 ? (
        <section className={styles.archive}>
          <button className={styles.archiveHandle} onClick={() => setArchiveOpen((value) => !value)}>
            <span className={styles.archiveSeal}>GW</span>
            <span>
              <strong>The Archive</strong>
              <small>{archived.length} retired volume{archived.length === 1 ? "" : "s"}</small>
            </span>
            <span className={styles.archiveToggle}>{archiveOpen ? "Close" : "Open drawer"} {archiveOpen ? "↑" : "↓"}</span>
          </button>
          {archiveOpen ? (
            <div className={styles.archiveDrawer}>
              {archived.map((book) => {
                const binding = bindingFor(book);
                return (
                  <div className={styles.archivedBook} key={book.slug}>
                    <span style={{ background: binding.base, color: binding.foil }}>{book.title}</span>
                    <small>{book.workflowLabel} · {book.pct}%</small>
                    <form action={restoreBookAction}>
                      <input name="slug" type="hidden" value={book.slug} />
                      <button type="submit">Return to library</button>
                    </form>
                    <form action={deleteBookAction}>
                      <input name="slug" type="hidden" value={book.slug} />
                      <button
                        type="submit"
                        className={styles.danger}
                        onClick={(event) => {
                          if (!window.confirm(`Delete "${book.title}" permanently?`)) event.preventDefault();
                        }}
                      >
                        Discard
                      </button>
                    </form>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
