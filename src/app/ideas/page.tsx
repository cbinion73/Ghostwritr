import Link from "next/link";
import { BookWorkflowType } from "@prisma/client";
import { AppTopBar } from "@/app/components/app-top-bar";
import { requireAuthenticatedAppUser } from "@/lib/auth/app-auth";
import { getBookIdeas } from "@/lib/jarvis/client";
import { listBooksForUser } from "@/lib/repositories/books";
import { promoteIdeaToBookAction, addJarvisIdeaAction, deleteIdeaAction, markIdeaWrittenAction } from "./actions";

export const dynamic = "force-dynamic";

const F = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';

export default async function IdeasPage() {
  const user = await requireAuthenticatedAppUser();
  const [allIdeas, books] = await Promise.all([getBookIdeas(), listBooksForUser(user.id)]);

  // Map slug → book so we can look up which ideas are already in production
  const bookBySlug = new Map(books.map((b) => [b.slug, b]));

  // Sort newest first — try createdAt or created_at
  const sorted = [...allIdeas].sort((a, b) => {
    const da = a.createdAt ?? a.created_at ?? "";
    const db_ = b.createdAt ?? b.created_at ?? "";
    return da < db_ ? 1 : da > db_ ? -1 : 0;
  });

  // Annotate each idea with the matching book (if any) or written status
  const annotated = sorted.map((idea) => {
    const matchedSlug = idea.tags?.find((tag) => bookBySlug.has(tag));
    const isWritten =
      idea.status === "written" ||
      idea.tags?.includes("written") ||
      Boolean(matchedSlug);
    return {
      idea,
      book: matchedSlug ? bookBySlug.get(matchedSlug) : undefined,
      isWritten,
    };
  });

  const inFunnel = annotated.filter((a) => !a.isWritten).length;
  const promoted = annotated.filter((a) => a.isWritten).length;
  const fromElsewhere = annotated.filter((a) => a.idea.source !== "ghostwritr").length;

  return (
    <div style={pageStyle}>
      <AppTopBar activePage="ideas" />

      <div style={bodyStyle}>
        {/* ── Left panel: Add Idea ── */}
        <aside style={sidebarStyle}>
          <div style={panelHeadStyle}>
            <div style={labelStyle}>CAPTURE</div>
            <div style={panelTitleStyle}>New idea</div>
            <div style={panelSubStyle}>
              Send a book idea straight to the Jarvis idea box. Come back and promote it when you&apos;re ready.
            </div>
          </div>

          <form action={addJarvisIdeaAction} style={formStyle}>
            <input
              name="text"
              style={inputStyle}
              type="text"
              placeholder="Book idea or working title"
              required
              autoComplete="off"
            />
            <textarea
              name="notes"
              style={textareaStyle}
              placeholder="Notes — premise, audience, promise… (optional)"
              rows={4}
            />
            <input
              name="tags"
              style={inputStyle}
              type="text"
              placeholder="Tags, comma-separated (optional)"
              autoComplete="off"
            />
            <button type="submit" style={addBtnStyle}>
              Save Idea →
            </button>
          </form>

          <div style={statsStyle}>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>In funnel</span>
              <span style={statValueStyle}>{inFunnel}</span>
            </div>
            <div style={statRowStyle}>
              <span style={statLabelStyle}>Become books</span>
              <span style={{ ...statValueStyle, color: "#4a7c59" }}>{promoted}</span>
            </div>
            {fromElsewhere > 0 && (
              <div style={statRowStyle}>
                <span style={statLabelStyle}>External sources</span>
                <span style={statValueStyle}>{fromElsewhere}</span>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main: Ideas funnel ── */}
        <main style={mainStyle}>
          <div style={mainHeadStyle}>
            <div style={labelStyle}>IDEA BOX</div>
            <div style={mainTitleStyle}>
              {annotated.length === 0
                ? "No ideas yet"
                : `${inFunnel} idea${inFunnel !== 1 ? "s" : ""} in the funnel`}
            </div>
          </div>

          {annotated.length === 0 ? (
            <div style={emptyStyle}>
              <div style={emptyTitleStyle}>Funnel is empty</div>
              <p style={emptySubStyle}>
                Add ideas using the form on the left, or capture them in Jarvis and they&apos;ll appear here.
                When a book moves through Book Setup, it also syncs back here automatically.
              </p>
            </div>
          ) : (
            <div style={gridStyle}>
              {annotated.map(({ idea, book, isWritten }) => (
                <IdeaCard key={idea.id} idea={idea} bookSlug={book?.slug} bookTitle={book?.titleWorking ?? undefined} isWritten={isWritten} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Idea card ─────────────────────────────────────────────────────────────

function IdeaCard({
  idea,
  bookSlug,
  bookTitle,
  isWritten,
}: {
  idea: Awaited<ReturnType<typeof getBookIdeas>>[number];
  bookSlug?: string;
  bookTitle?: string;
  isWritten?: boolean;
}) {
  const isBook = Boolean(bookSlug);
  const date = idea.createdAt ?? idea.created_at;
  const displayDate = date
    ? new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const isGhostwritr = idea.source === "ghostwritr";
  const notesPreview = idea.notes
    ? idea.notes.length > 160
      ? idea.notes.slice(0, 160) + "…"
      : idea.notes
    : null;

  // Tags — exclude internal plumbing tags, the book slug, and "written"
  const displayTags = (idea.tags ?? []).filter(
    (t) => t !== "ghostwritr" && t !== "book" && t !== "written" && t !== bookSlug,
  );

  return (
    <article style={{ ...cardStyle, ...(isWritten ? cardWrittenStyle : {}) }}>
      <div style={cardTopStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={cardTitleStyle}>{idea.text}</div>
          {notesPreview && <div style={cardNotesStyle}>{notesPreview}</div>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
          {isWritten && (
            <div style={checkmarkBadgeStyle} title={isBook ? "In Ghostwritr" : "Marked as written"}>
              ✓
            </div>
          )}
          {isGhostwritr && !isWritten && (
            <div style={sourceBadgeStyle}>Ghostwritr</div>
          )}
        </div>
      </div>

      {displayTags.length > 0 && (
        <div style={tagsRowStyle}>
          {displayTags.map((tag) => (
            <span key={tag} style={tagChipStyle}>{tag}</span>
          ))}
        </div>
      )}

      {displayDate && (
        <div style={cardDateStyle}>{displayDate}</div>
      )}

      <div style={cardFooterStyle}>
        {isBook ? (
          // Already a Ghostwritr book — open it
          <Link href={`/books/${bookSlug}`} style={openBookBtnStyle}>
            Open Book Studio →
          </Link>
        ) : isWritten ? (
          // Externally written — no actions, just a label
          <span style={writtenLabelStyle}>Written ✓</span>
        ) : (
          // Still an idea — promote or delete
          <form action={promoteIdeaToBookAction} style={{ flex: 1, display: "flex", gap: "8px" }}>
            <input type="hidden" name="title" value={idea.text} />
            <input type="hidden" name="notes" value={idea.notes ?? ""} />
            <select name="workflowType" style={workflowSelectStyle} defaultValue={BookWorkflowType.NONFICTION}>
              <option value={BookWorkflowType.NONFICTION}>Nonfiction</option>
              <option value={BookWorkflowType.FICTION}>Fiction</option>
            </select>
            <button type="submit" style={promoteBtnStyle}>
              Promote to Book →
            </button>
          </form>
        )}
        {!isWritten && (
          // Mark as written (externally) or delete
          <>
            <form action={markIdeaWrittenAction}>
              <input type="hidden" name="id" value={idea.id} />
              <button type="submit" style={markWrittenBtnStyle} title="Mark as already written">
                ✓
              </button>
            </form>
            <form action={deleteIdeaAction}>
              <input type="hidden" name="id" value={idea.id} />
              <button type="submit" style={deleteBtnStyle} title="Remove from funnel">
                ×
              </button>
            </form>
          </>
        )}
      </div>
    </article>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#1a1410",
  fontFamily: F,
  display: "flex",
  flexDirection: "column",
};

const bodyStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  gap: "0",
  overflow: "hidden",
  minHeight: 0,
};

const sidebarStyle: React.CSSProperties = {
  width: "300px",
  flexShrink: 0,
  borderRight: "1px solid rgba(255,255,255,0.06)",
  padding: "32px 28px",
  display: "flex",
  flexDirection: "column",
  gap: "28px",
  overflowY: "auto",
};

const panelHeadStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
};

const labelStyle: React.CSSProperties = {
  fontSize: "10px",
  letterSpacing: "0.1em",
  color: "#5a4a3a",
  fontWeight: 600,
  fontFamily: F,
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#e8d5b0",
  fontFamily: F,
  lineHeight: 1.2,
};

const panelSubStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#6a5a4a",
  lineHeight: 1.6,
  fontFamily: F,
};

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "#e8d5b0",
  fontSize: "13px",
  fontFamily: F,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "vertical" as const,
  lineHeight: 1.5,
};

const addBtnStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: "6px",
  border: "none",
  background: "#B8793A",
  color: "#fff",
  fontSize: "13px",
  fontWeight: 600,
  fontFamily: F,
  cursor: "pointer",
  textAlign: "center" as const,
  marginTop: "4px",
};

const statsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  borderTop: "1px solid rgba(255,255,255,0.06)",
  paddingTop: "20px",
};

const statRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#5a4a3a",
  fontFamily: F,
};

const statValueStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#8a7060",
  fontFamily: F,
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  padding: "32px 40px",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
};

const mainHeadStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "12px",
};

const mainTitleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#e8d5b0",
  fontFamily: F,
};

const emptyStyle: React.CSSProperties = {
  padding: "48px 0",
  maxWidth: "480px",
};

const emptyTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  color: "#5a4a3a",
  fontFamily: F,
  marginBottom: "10px",
};

const emptySubStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#4a3a2a",
  lineHeight: 1.7,
  fontFamily: F,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))",
  gap: "16px",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(254,251,245,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: "10px",
  padding: "20px 22px",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  transition: "border-color 200ms",
};

const cardTopStyle: React.CSSProperties = {
  display: "flex",
  gap: "12px",
  alignItems: "flex-start",
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#e8d5b0",
  fontFamily: F,
  lineHeight: 1.3,
};

const cardNotesStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6a5a4a",
  fontFamily: F,
  marginTop: "6px",
  lineHeight: 1.5,
};

const sourceBadgeStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.05em",
  color: "#c9a96e",
  padding: "2px 7px",
  borderRadius: "4px",
  border: "1px solid rgba(201,169,110,0.3)",
  background: "rgba(201,169,110,0.08)",
  whiteSpace: "nowrap" as const,
  flexShrink: 0,
  alignSelf: "flex-start",
  fontFamily: F,
};

const tagsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "6px",
};

const tagChipStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#6a5a4a",
  padding: "2px 8px",
  borderRadius: "4px",
  border: "1px solid rgba(255,255,255,0.07)",
  background: "rgba(255,255,255,0.03)",
  fontFamily: F,
};

const cardDateStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#4a3a2a",
  fontFamily: F,
};

const cardFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  paddingTop: "4px",
  borderTop: "1px solid rgba(255,255,255,0.05)",
};

const workflowSelectStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.05)",
  color: "#8a7060",
  fontSize: "12px",
  fontFamily: F,
  outline: "none",
  cursor: "pointer",
  appearance: "none" as const,
};

const promoteBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 14px",
  borderRadius: "6px",
  border: "1px solid rgba(184,121,58,0.4)",
  background: "rgba(184,121,58,0.1)",
  color: "#c9a96e",
  fontSize: "12px",
  fontWeight: 600,
  fontFamily: F,
  cursor: "pointer",
  textAlign: "center" as const,
  transition: "background 150ms",
};

const deleteBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.07)",
  background: "transparent",
  color: "#4a3a2a",
  fontSize: "16px",
  lineHeight: 1,
  fontFamily: F,
  cursor: "pointer",
  flexShrink: 0,
  transition: "color 150ms, border-color 150ms",
};

const cardWrittenStyle: React.CSSProperties = {
  borderColor: "rgba(74,124,89,0.35)",
  background: "rgba(74,124,89,0.06)",
};

const checkmarkBadgeStyle: React.CSSProperties = {
  width: "22px",
  height: "22px",
  borderRadius: "50%",
  background: "#4a7c59",
  color: "#fff",
  fontSize: "13px",
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  lineHeight: 1,
};

const writtenLabelStyle: React.CSSProperties = {
  flex: 1,
  fontSize: "12px",
  color: "#4a7c59",
  fontFamily: F,
  fontWeight: 600,
};

const markWrittenBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "6px",
  border: "1px solid rgba(74,124,89,0.35)",
  background: "transparent",
  color: "#4a7c59",
  fontSize: "13px",
  lineHeight: 1,
  fontFamily: F,
  cursor: "pointer",
  flexShrink: 0,
  transition: "background 150ms",
};

const openBookBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 14px",
  borderRadius: "6px",
  border: "1px solid rgba(74,124,89,0.4)",
  background: "rgba(74,124,89,0.1)",
  color: "#6aaa7a",
  fontSize: "12px",
  fontWeight: 600,
  fontFamily: F,
  textDecoration: "none",
  textAlign: "center" as const,
  transition: "background 150ms",
};
