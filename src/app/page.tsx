import Link from "next/link";
import { BookWorkflowType } from "@prisma/client";

import { createBookAction, deleteBookAction } from "./actions";
import { db } from "@/lib/db";

async function listBooksWithParent() {
  return db.book.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      stages: { orderBy: { createdAt: "asc" } },
      parentBook: { select: { titleWorking: true, slug: true } },
    },
  });
}
import { AppTopBar } from "./components/app-top-bar";
import { Bookshelf, type ShelfBook } from "./bookshelf";

export const dynamic = "force-dynamic";

const F = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getProgress(stages: Array<{ status: string }>) {
  if (stages.length === 0) return 0;
  const committed = stages.filter((s) => s.status === "COMMITTED").length;
  return Math.round((committed / stages.length) * 100);
}

function getActiveStageLabel(stages: Array<{ stageKey: string; status: string }>) {
  const active =
    stages.find((s) => s.status === "IN_PROGRESS") ??
    stages.find((s) => s.status === "READY_FOR_REVIEW") ??
    stages.find((s) => s.status === "BLOCKED");
  if (!active) {
    const committed = [...stages].reverse().find((s) => s.status === "COMMITTED");
    return committed
      ? committed.stageKey.replace(/_/g, " ")
      : "Not started";
  }
  return active.stageKey.replace(/_/g, " ");
}

function getStatusColor(stages: Array<{ status: string }>) {
  const pct = getProgress(stages);
  if (pct === 100) return "#4a7c59";
  if (pct > 60) return "#B8793A";
  return "#6f6256";
}

type BookWithStages = Awaited<ReturnType<typeof listBooksWithParent>>[number];

function toShelfBook(book: BookWithStages): ShelfBook {
  const stages = book.stages.map((s) => ({
    stageKey: String(s.stageKey),
    status: String(s.status),
  }));
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const allBooks = await listBooksWithParent();
  const books = allBooks.filter((b) => !b.isArchived);
  const archivedBooks = allBooks.filter((b) => b.isArchived);

  return (
    <div style={pageStyle}>
      {/* ── Top bar ── */}
      <AppTopBar activePage="library" />

      {/* ── Body ── */}
      <div style={bodyStyle}>
        {/* ── New Book panel ── */}
        <aside style={newBookPanelStyle}>
          <div style={panelHeadStyle}>
            <div style={panelLabelStyle}>NEW BOOK</div>
            <div style={panelTitleStyle}>Start writing</div>
            <div style={panelSubStyle}>
              Give your book a working title and we&apos;ll open it in Book Studio ready to go.
            </div>
          </div>

          <form action={createBookAction} style={formStyle}>
            <input
              name="titleWorking"
              style={inputStyle}
              type="text"
              placeholder="Working title"
              autoComplete="off"
            />
            <input
              name="subtitle"
              style={inputStyle}
              type="text"
              placeholder="Subtitle (optional)"
              autoComplete="off"
            />
            <select name="workflowType" style={selectStyle} defaultValue={BookWorkflowType.NONFICTION}>
              <option value={BookWorkflowType.NONFICTION}>Nonfiction</option>
              <option value={BookWorkflowType.FICTION}>Fiction</option>
            </select>
            <button type="submit" style={createBtnStyle}>
              Create Book →
            </button>
          </form>

          <Link href="/ideas" style={ideasLinkStyle}>
            View idea box →
          </Link>
        </aside>

        {/* ── Library ── */}
        <main style={libraryStyle}>
          <div style={libraryHeadStyle}>
            <div style={panelLabelStyle}>LIBRARY</div>
            <div style={libraryTitleStyle}>
              {books.length} book{books.length !== 1 ? "s" : ""}
              {archivedBooks.length > 0 ? ` · ${archivedBooks.length} archived` : ""}
            </div>
          </div>

          {books.length === 0 && archivedBooks.length === 0 ? (
            <div style={emptyStyle}>
              No books yet — create your first one.
            </div>
          ) : (
            <Bookshelf
              books={books.map(toShelfBook)}
              archived={archivedBooks.map(toShelfBook)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

// ── New Book panel ────────────────────────────────────────────────────────────

const newBookPanelStyle: React.CSSProperties = {
  width: "280px",
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

const panelLabelStyle: React.CSSProperties = {
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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
  appearance: "none" as const,
};

const createBtnStyle: React.CSSProperties = {
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
  transition: "opacity 150ms",
};

const ideasLinkStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "#5a4a3a",
  textDecoration: "none",
  fontFamily: F,
  textAlign: "center" as const,
  paddingTop: "4px",
  transition: "color 150ms",
};

// ── Library ───────────────────────────────────────────────────────────────────

const libraryStyle: React.CSSProperties = {
  flex: 1,
  padding: "32px 40px",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
};

const libraryHeadStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "12px",
};

const libraryTitleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  color: "#e8d5b0",
  fontFamily: F,
};

const emptyStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#5a4a3a",
  fontFamily: F,
  padding: "40px 0",
};

const cardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
  gap: "16px",
};

const cardStyle: React.CSSProperties = {
  background: "rgba(254,251,245,0.04)",
  border: "1px solid rgba(255,255,255,0.07)",
  borderRadius: "10px",
  padding: "20px 22px",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
  transition: "border-color 200ms, background 200ms",
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

const cardSubtitleStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#8a7060",
  fontFamily: F,
  marginTop: "3px",
  lineHeight: 1.4,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap" as const,
};

const cardPremiseStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6a5a4a",
  fontFamily: F,
  marginTop: "6px",
  lineHeight: 1.5,
};

const cardBadgeStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  padding: "3px 8px",
  borderRadius: "4px",
  border: "1px solid",
  whiteSpace: "nowrap" as const,
  flexShrink: 0,
  alignSelf: "flex-start",
  marginTop: "2px",
  fontFamily: F,
};

const progressRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const progressTrackStyle: React.CSSProperties = {
  flex: 1,
  height: "3px",
  background: "rgba(255,255,255,0.08)",
  borderRadius: "2px",
  overflow: "hidden",
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  borderRadius: "2px",
  transition: "width 400ms ease",
};

const progressLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  fontFamily: F,
  whiteSpace: "nowrap" as const,
};

const stageLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#6a5a4a",
  fontFamily: F,
  whiteSpace: "nowrap" as const,
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "160px",
};

const cardFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  paddingTop: "4px",
  borderTop: "1px solid rgba(255,255,255,0.05)",
};

const openBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 14px",
  borderRadius: "6px",
  border: "1px solid rgba(184,121,58,0.4)",
  background: "rgba(184,121,58,0.1)",
  color: "#c9a96e",
  fontSize: "12px",
  fontWeight: 600,
  fontFamily: F,
  textDecoration: "none",
  textAlign: "center" as const,
  transition: "background 150ms",
};

const deleteBtnStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: "6px",
  border: "1px solid rgba(255,255,255,0.08)",
  background: "transparent",
  color: "#4a3a2a",
  fontSize: "12px",
  fontFamily: F,
  cursor: "pointer",
  transition: "color 150ms",
};

const companionBadgeStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#5a7a60",
  fontFamily: F,
  marginTop: "5px",
  fontStyle: "italic",
};

const companionParentLinkStyle: React.CSSProperties = {
  color: "#5a7a60",
  textDecoration: "underline",
};
