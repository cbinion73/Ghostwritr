import Link from "next/link";
import styles from "./app-top-bar.module.css";

interface AppTopBarProps {
  bookSlug?: string;
  bookTitle?: string;
  activePage?: "library" | "ideas" | "personas" | "dashboard" | "studio";
}

export function AppTopBar({ bookSlug, bookTitle, activePage }: AppTopBarProps) {
  return (
    <header className={styles.bar}>
      <div className={styles.identity}>
        <Link href="/" className={styles.mark} aria-label="Ghostwritr home">G</Link>
        <Link href="/" className={styles.wordmark}>
          <strong>GHOSTWRITR</strong>
          <span>Books, beautifully made</span>
        </Link>
      </div>

      <nav className={styles.nav} aria-label="Primary navigation">
        <Link href="/" className={activePage === "library" ? styles.active : ""}>Library</Link>
        <Link href="/ideas" className={activePage === "ideas" ? styles.active : ""}>Idea cabinet</Link>
        <Link href="/personas" className={activePage === "personas" ? styles.active : ""}>Readers</Link>
        {bookSlug ? (
          <Link href={`/books/${bookSlug}`} className={activePage === "studio" ? styles.active : styles.studioLink}>
            <span>In the studio</span>
            <strong>{bookTitle ?? "Open book"}</strong>
          </Link>
        ) : null}
        {activePage === "dashboard" ? <span className={`${styles.active} ${styles.current}`}>Dashboard</span> : null}
      </nav>

      <div className={styles.pressMark}><span>PRIVATE</span><b>PRESS</b></div>
    </header>
  );
}
