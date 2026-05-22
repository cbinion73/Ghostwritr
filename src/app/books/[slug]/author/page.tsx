import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AuthorPanel } from "./author-panel";
import { AppTopBar } from "@/app/components/app-top-bar";
import { STAGE_LINKS } from "@/lib/navigation";

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const book = await db.book.findUnique({
    where: { slug },
    select: { titleWorking: true, subtitle: true, metadataJson: true },
  });
  if (!book) notFound();

  const meta = (book.metadataJson ?? {}) as Record<string, unknown>;

  return (
    <div className="dark-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppTopBar bookSlug={slug} bookTitle={book.titleWorking ?? undefined} activePage="studio" />
      <div className="page-shell" style={{ flex: 1 }}>
        <aside className="glass-panel sidebar">
          <div className="brand-mark">
            <h1>GHOSTWRITR</h1>
            <p className="muted">Author profile — shown in your book&apos;s front matter and marketing.</p>
          </div>
          <div className="muted" style={{ marginBottom: 20 }}>
            <div>Book: <strong>{book.titleWorking ?? "Untitled Book"}</strong></div>
          </div>
          <div className="stage-list">
            <Link href="/" className="stage-chip">← Library</Link>
            {STAGE_LINKS.map((stage) => (
              <Link key={stage.key} href={stage.href(slug)} className="stage-chip">
                {stage.label}
              </Link>
            ))}
          </div>
        </aside>
        <main className="main-column">
          <AuthorPanel
            slug={slug}
            bookTitle={book.titleWorking ?? slug}
            initialFull={      (meta.authorBioFull      as string) ?? ""}
            initialShort={     (meta.authorBioShort     as string) ?? ""}
            initialBackCover={ (meta.authorBioBackCover as string) ?? ""}
          />
        </main>
      </div>
    </div>
  );
}
