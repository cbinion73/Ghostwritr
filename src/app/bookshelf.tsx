"use client";

/**
 * The Library bookshelf — a photorealistic wooden bookcase where every
 * manuscript is a book spine. Bindings are deterministic per book (slug
 * hash → palette, height, width, style, lean), so your shelf always looks
 * the same. Click a book to "check it out": it pulls off the shelf and the
 * Book Studio opens.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { archiveBookAction, deleteBookAction, restoreBookAction } from "./actions";

export type ShelfBook = {
  slug: string;
  title: string;
  subtitle: string | null;
  workflowLabel: string;
  pct: number;
  activeLabel: string;
};

// ── Deterministic styling from the slug ──────────────────────────────────────

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

type Binding = {
  base: string;      // spine color
  dark: string;      // hinge/edge shade
  foil: string;      // title color
  label: boolean;    // paper label behind the title (cloth style)
  labelBg?: string;
  bands: boolean;    // raised leather bands
};

const BINDINGS: Binding[] = [
  { base: "#5c1f1f", dark: "#3a1212", foil: "#d9b45c", label: false, bands: true },  // oxblood leather
  { base: "#1f3d2b", dark: "#122619", foil: "#cfa84e", label: false, bands: true },  // forest leather
  { base: "#1e2a44", dark: "#111a2c", foil: "#e8dcc0", label: false, bands: false }, // navy cloth
  { base: "#4a1a2c", dark: "#2e0f1b", foil: "#d9b45c", label: false, bands: true },  // burgundy
  { base: "#2b2b30", dark: "#19191d", foil: "#c0c4cc", label: false, bands: false }, // charcoal
  { base: "#8a6a2f", dark: "#5c451d", foil: "#2b2115", label: false, bands: false }, // ochre buckram
  { base: "#d9cdb4", dark: "#b3a685", foil: "#3a3226", label: false, bands: false }, // cream cloth
  { base: "#7a3b22", dark: "#4e2414", foil: "#e8d5a0", label: false, bands: true },  // rust
  { base: "#174a4a", dark: "#0d2e2e", foil: "#d9c98c", label: true, labelBg: "#efe6cf", bands: false }, // teal + label
  { base: "#3d2543", dark: "#26152b", foil: "#d0b060", label: false, bands: true },  // plum
  { base: "#4a4a28", dark: "#2e2e18", foil: "#e0d6b0", label: true, labelBg: "#e9e0c8", bands: false }, // olive + label
  { base: "#4e3420", dark: "#2f1e11", foil: "#d9b45c", label: false, bands: true },  // brown leather
];

type SpineSpec = {
  binding: Binding;
  height: number;
  width: number;
  lean: number;       // degrees; most books stand straight
  fontSize: number;
};

function specFor(book: ShelfBook): SpineSpec {
  const h = hash(book.slug);
  const binding = BINDINGS[h % BINDINGS.length];
  const height = 225 + (Math.floor(h / 7) % 70);        // 225–294px
  const width = 36 + (Math.floor(h / 13) % 24);         // 36–59px
  const leanRoll = Math.floor(h / 31) % 10;
  const lean = leanRoll === 3 ? 4.5 : leanRoll === 7 ? -3.5 : 0;
  const fontSize = book.title.length > 34 ? 10.5 : book.title.length > 22 ? 11.5 : 13;
  return { binding, height, width, lean, fontSize };
}

// ── Shelf packing: fill each shelf up to a fixed inner width ─────────────────

function packShelves(books: ShelfBook[], innerWidth: number) {
  const shelves: ShelfBook[][] = [];
  let current: ShelfBook[] = [];
  let used = 0;
  for (const book of books) {
    const w = specFor(book).width + 6;
    if (used + w > innerWidth && current.length > 0) {
      shelves.push(current);
      current = [];
      used = 0;
    }
    current.push(book);
    used += w;
  }
  if (current.length > 0) shelves.push(current);
  return shelves;
}

// ── Component ────────────────────────────────────────────────────────────────

export function Bookshelf({
  books,
  archived = [],
}: {
  books: ShelfBook[];
  archived?: ShelfBook[];
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [boxOpen, setBoxOpen] = useState(false);

  const shelves = useMemo(() => packShelves(books, 860), [books]);
  const hoveredBook = books.find((b) => b.slug === hovered) ?? null;

  function checkOut(slug: string) {
    if (checkingOut) return;
    setCheckingOut(slug);
    // Let the pull-off-the-shelf animation play before navigating.
    setTimeout(() => router.push(`/books/${slug}`), 480);
  }

  return (
    <div style={caseOuterStyle}>
      <style>{`
        @keyframes gw-checkout {
          0%   { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
          55%  { transform: translateY(-46px) rotate(-7deg) scale(1.04); opacity: 1; }
          100% { transform: translateY(-70px) rotate(-10deg) scale(1.08); opacity: 0; }
        }
        .gw-spine { transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease; }
        .gw-spine:hover { transform: translateY(-12px); filter: brightness(1.08); z-index: 5; }
        .gw-spine.gw-out { animation: gw-checkout 480ms ease-in forwards; z-index: 6; }
      `}</style>

      {/* Bookcase frame */}
      <div style={caseFrameStyle}>
        {shelves.map((shelf, shelfIndex) => (
          <div key={`shelf-${shelfIndex}`} style={shelfBayStyle}>
            {/* Books standing on the shelf */}
            <div style={shelfBooksStyle}>
              {shelf.map((book) => {
                const spec = specFor(book);
                const b = spec.binding;
                const isOut = checkingOut === book.slug;
                return (
                  <button
                    key={book.slug}
                    className={`gw-spine${isOut ? " gw-out" : ""}`}
                    onClick={() => checkOut(book.slug)}
                    onMouseEnter={() => setHovered(book.slug)}
                    onMouseLeave={() => setHovered((v) => (v === book.slug ? null : v))}
                    title={`${book.title} — check out`}
                    style={{
                      ...spineStyle,
                      width: spec.width,
                      height: spec.height,
                      transform: spec.lean ? `rotate(${spec.lean}deg)` : undefined,
                      transformOrigin: spec.lean > 0 ? "bottom right" : "bottom left",
                      marginLeft: spec.lean ? 10 : 0,
                      marginRight: spec.lean ? 10 : 0,
                      background: [
                        // Spine curvature: highlight near the left hinge, falloff to the right
                        `linear-gradient(90deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.06) 9%, rgba(0,0,0,0) 22%, rgba(0,0,0,0.18) 78%, rgba(0,0,0,0.38) 100%)`,
                        // Head & tail shading
                        `linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 5%, rgba(0,0,0,0) 94%, rgba(0,0,0,0.35) 100%)`,
                        // Raised bands for leather bindings
                        ...(b.bands
                          ? [
                              `linear-gradient(180deg, transparent 8%, rgba(255,255,255,0.14) 8.6%, rgba(0,0,0,0.22) 10%, transparent 10.6%, transparent 13%, rgba(255,255,255,0.14) 13.6%, rgba(0,0,0,0.22) 15%, transparent 15.6%, transparent 84%, rgba(255,255,255,0.12) 84.6%, rgba(0,0,0,0.2) 86%, transparent 86.6%)`,
                            ]
                          : []),
                        b.base,
                      ].join(", "),
                      borderLeft: `1px solid ${b.dark}`,
                      borderRight: `2px solid ${b.dark}`,
                      boxShadow: isOut
                        ? "0 24px 30px rgba(0,0,0,0.55)"
                        : hovered === book.slug
                          ? "0 16px 22px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)"
                          : "2px 3px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)",
                    }}
                  >
                    {/* Paper label variant */}
                    {b.label ? (
                      <span
                        style={{
                          ...labelStyle,
                          background: b.labelBg,
                          maxHeight: spec.height - 70,
                        }}
                      >
                        <span
                          style={{
                            ...spineTitleStyle,
                            color: "#3a3226",
                            fontSize: spec.fontSize - 1,
                            textShadow: "none",
                            maxHeight: spec.height - 86,
                          }}
                        >
                          {book.title}
                        </span>
                      </span>
                    ) : (
                      <span
                        style={{
                          ...spineTitleStyle,
                          color: b.foil,
                          fontSize: spec.fontSize,
                          maxHeight: spec.height - 56,
                        }}
                      >
                        {book.title}
                      </span>
                    )}
                    {/* Publisher mark at the tail of the spine */}
                    <span style={{ ...tailMarkStyle, color: b.label ? "#efe6cf" : b.foil }}>
                      ✒
                    </span>
                  </button>
                );
              })}

              {/* Bookend on partially filled shelves */}
              {shelfIndex === shelves.length - 1 && (
                <div style={bookendStyle} aria-hidden>
                  <div style={bookendFaceStyle} />
                </div>
              )}
            </div>

            {/* The shelf board */}
            <div style={shelfBoardStyle} />
          </div>
        ))}
      </div>

      {/* Checkout plaque — brass card under the case for the hovered book */}
      <div style={{ ...plaqueStyle, opacity: hoveredBook ? 1 : 0 }}>
        {hoveredBook ? (
          <>
            <div style={{ minWidth: 0 }}>
              <div style={plaqueTitleStyle}>
                {hoveredBook.title}
                <span style={plaqueTypeStyle}> · {hoveredBook.workflowLabel}</span>
              </div>
              <div style={plaqueMetaStyle}>
                {hoveredBook.subtitle ? `${hoveredBook.subtitle} · ` : ""}
                {hoveredBook.pct}% written · {hoveredBook.activeLabel.toLowerCase()}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
              <span style={plaqueHintStyle}>click the spine to check out →</span>
              <form action={archiveBookAction} style={{ display: "inline" }}>
                <input name="slug" type="hidden" value={hoveredBook.slug} />
                <button
                  type="submit"
                  style={plaqueDeleteStyle}
                  title="Move this book into the storage box (restorable anytime)"
                >
                  archive
                </button>
              </form>
              <form action={deleteBookAction} style={{ display: "inline" }}>
                <input name="slug" type="hidden" value={hoveredBook.slug} />
                <button
                  type="submit"
                  style={plaqueDeleteStyle}
                  title="Remove this book from the library"
                  onClick={(event) => {
                    if (!window.confirm(`Delete "${hoveredBook.title}" permanently?`)) {
                      event.preventDefault();
                    }
                  }}
                >
                  discard
                </button>
              </form>
            </div>
          </>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>

      {/* Storage box — archived books stacked flat, restorable anytime */}
      {archived.length > 0 && (
        <div style={boxOuterStyle}>
          <button style={boxLidStyle} onClick={() => setBoxOpen((v) => !v)}>
            <span style={boxLabelStyle}>ARCHIVE</span>
            <span style={{ fontStyle: "italic", opacity: 0.8 }}>
              {archived.length} book{archived.length !== 1 ? "s" : ""} in storage
            </span>
            <span style={{ marginLeft: "auto", opacity: 0.7 }}>{boxOpen ? "close ▴" : "open ▾"}</span>
          </button>

          {boxOpen && (
            <div style={boxInteriorStyle}>
              {archived.map((book) => {
                const b = specFor(book).binding;
                return (
                  <div key={book.slug} style={flatBookRowStyle}>
                    {/* The book lying on its side */}
                    <div
                      style={{
                        ...flatSpineStyle,
                        background: `linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(0,0,0,0.25) 100%), ${b.base}`,
                        borderColor: b.dark,
                      }}
                    >
                      <span style={{ ...flatTitleStyle, color: b.foil }}>{book.title}</span>
                    </div>
                    <span style={flatMetaStyle}>
                      {book.workflowLabel} · {book.pct}% written
                    </span>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <form action={restoreBookAction}>
                        <input name="slug" type="hidden" value={book.slug} />
                        <button type="submit" style={boxActionStyle} title="Put this book back on the shelf">
                          ↩ back on the shelf
                        </button>
                      </form>
                      <form action={deleteBookAction}>
                        <input name="slug" type="hidden" value={book.slug} />
                        <button
                          type="submit"
                          style={{ ...boxActionStyle, opacity: 0.6 }}
                          title="Delete permanently"
                          onClick={(event) => {
                            if (!window.confirm(`Delete "${book.title}" permanently?`)) {
                              event.preventDefault();
                            }
                          }}
                        >
                          discard
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const caseOuterStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  maxWidth: 960,
};

const caseFrameStyle: React.CSSProperties = {
  padding: "26px 30px 12px",
  borderRadius: 10,
  // Outer case: dark stained wood with side rails
  background: [
    "linear-gradient(90deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 3%, rgba(0,0,0,0) 97%, rgba(0,0,0,0.5) 100%)",
    "linear-gradient(180deg, #3a2716 0%, #2b1c10 100%)",
  ].join(", "),
  border: "10px solid transparent",
  borderImage: "linear-gradient(180deg, #573d24, #241708) 1",
  boxShadow: "0 22px 44px rgba(0,0,0,0.55), inset 0 0 60px rgba(0,0,0,0.5)",
};

const shelfBayStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
};

const shelfBooksStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-end",
  gap: 4,
  minHeight: 300,
  padding: "18px 8px 0",
  // Shadowed back panel behind the books
  background:
    "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 40%, rgba(0,0,0,0.15) 100%)",
  borderRadius: "3px 3px 0 0",
};

const shelfBoardStyle: React.CSSProperties = {
  height: 16,
  borderRadius: 2,
  background: [
    "linear-gradient(180deg, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.04) 18%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.45) 100%)",
    "repeating-linear-gradient(90deg, #5a3f24 0px, #6b4c2c 34px, #573d22 78px, #634628 120px)",
  ].join(", "),
  boxShadow: "0 5px 8px rgba(0,0,0,0.5)",
  marginBottom: 10,
};

const spineStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  border: "none",
  borderRadius: "2px 2px 1px 1px",
  cursor: "pointer",
  padding: "26px 0 20px",
  flexShrink: 0,
  outline: "none",
};

const spineTitleStyle: React.CSSProperties = {
  writingMode: "vertical-rl",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
  fontWeight: 700,
  letterSpacing: "0.04em",
  lineHeight: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textShadow: "0 1px 1px rgba(0,0,0,0.6), 0 0 6px rgba(255,255,255,0.08)",
  maxWidth: "100%",
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 3px",
  borderRadius: 2,
  boxShadow: "inset 0 0 4px rgba(0,0,0,0.35), 0 1px 1px rgba(0,0,0,0.3)",
  margin: "6px 0",
};

const tailMarkStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 6,
  fontSize: 9,
  opacity: 0.75,
};

const bookendStyle: React.CSSProperties = {
  width: 40,
  height: 110,
  marginLeft: 14,
  display: "flex",
  alignItems: "flex-end",
};

const bookendFaceStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "3px 10px 2px 2px",
  background: "linear-gradient(135deg, #6a6f76 0%, #3c4046 55%, #24272b 100%)",
  boxShadow: "3px 4px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)",
};

const plaqueStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "12px 18px",
  borderRadius: 6,
  background: "linear-gradient(180deg, #8a6a35 0%, #6e5326 100%)",
  border: "1px solid #a8854a",
  boxShadow: "0 6px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.3)",
  color: "#f4e9cf",
  minHeight: 30,
  transition: "opacity 200ms ease",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const plaqueTitleStyle: React.CSSProperties = {
  fontSize: 14.5,
  fontWeight: 700,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const plaqueTypeStyle: React.CSSProperties = {
  fontWeight: 400,
  fontSize: 12,
  opacity: 0.85,
};

const plaqueMetaStyle: React.CSSProperties = {
  fontSize: 12,
  opacity: 0.8,
  marginTop: 2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const plaqueHintStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontStyle: "italic",
  opacity: 0.75,
  whiteSpace: "nowrap",
};

const plaqueDeleteStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(244,233,207,0.4)",
  borderRadius: 4,
  color: "#f4e9cf",
  fontSize: 11,
  padding: "3px 9px",
  cursor: "pointer",
  opacity: 0.8,
};

// ── Storage box (archived books) ─────────────────────────────────────────────

const boxOuterStyle: React.CSSProperties = {
  borderRadius: 8,
  overflow: "hidden",
  border: "1px solid #4a3319",
  boxShadow: "0 10px 22px rgba(0,0,0,0.45)",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
};

const boxLidStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 12,
  width: "100%",
  padding: "12px 18px",
  border: "none",
  cursor: "pointer",
  color: "#cdb98e",
  fontSize: 13,
  fontFamily: "inherit",
  textAlign: "left",
  // Cardboard-and-wood lid
  background: [
    "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0.18) 100%)",
    "repeating-linear-gradient(90deg, #46311b 0px, #503a20 40px, #443019 90px)",
  ].join(", "),
};

const boxLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.14em",
  border: "1px solid rgba(205,185,142,0.5)",
  borderRadius: 3,
  padding: "2px 8px",
};

const boxInteriorStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "16px 18px 18px",
  background:
    "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 100%), #241a0f",
};

const flatBookRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
};

const flatSpineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 210,
  maxWidth: 320,
  height: 30,
  padding: "0 14px",
  borderRadius: 2,
  borderLeft: "3px solid",
  borderRight: "1px solid",
  boxShadow: "0 3px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
};

const flatTitleStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  letterSpacing: "0.03em",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  textShadow: "0 1px 1px rgba(0,0,0,0.6)",
};

const flatMetaStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: "#8d7c5f",
  whiteSpace: "nowrap",
};

const boxActionStyle: React.CSSProperties = {
  background: "none",
  border: "1px solid rgba(205,185,142,0.35)",
  borderRadius: 4,
  color: "#cdb98e",
  fontSize: 11,
  padding: "4px 10px",
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};
