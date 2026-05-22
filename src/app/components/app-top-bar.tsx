import Link from "next/link";

const F = '"Iowan Old Style", "Palatino Linotype", Georgia, serif';

interface AppTopBarProps {
  /** Slug of the current book — enables the "Book Studio" link */
  bookSlug?: string;
  /** Human title of the current book — shown in the breadcrumb */
  bookTitle?: string;
  /** Which nav item is active */
  activePage?: "library" | "ideas" | "personas" | "dashboard" | "studio";
}

export function AppTopBar({ bookSlug, bookTitle, activePage }: AppTopBarProps) {
  return (
    <div style={barStyle}>
      {/* Left: wordmark + nav */}
      <div style={leftStyle}>
        <Link href="/" style={wordmarkStyle}>GHOSTWRITR</Link>
        <span style={divStyle} />

        <Link
          href="/"
          style={navLinkStyle(activePage === "library")}
        >
          Library
        </Link>

        <Link
          href="/ideas"
          style={navLinkStyle(activePage === "ideas")}
        >
          Ideas
        </Link>

        <Link
          href="/personas"
          style={navLinkStyle(activePage === "personas")}
        >
          Personas
        </Link>

        {bookSlug && (
          <>
            <span style={divStyle} />
            <Link
              href={`/books/${bookSlug}`}
              style={navLinkStyle(activePage === "studio")}
            >
              {bookTitle ? `↗ ${bookTitle}` : "↗ Book Studio"}
            </Link>
            {activePage === "dashboard" && (
              <span style={currentPageStyle}>Dashboard</span>
            )}
          </>
        )}
      </div>

      {/* Right: subtle tagline */}
      <div style={taglineStyle}>Your AI book production studio</div>
    </div>
  );
}

const barStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 24px",
  background: "#1a1410",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  flexShrink: 0,
  gap: "16px",
};

const leftStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  flexWrap: "nowrap" as const,
};

const wordmarkStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.1em",
  color: "#c9a96e",
  textDecoration: "none",
  fontFamily: F,
  whiteSpace: "nowrap" as const,
};

const divStyle: React.CSSProperties = {
  width: "1px",
  height: "14px",
  background: "rgba(255,255,255,0.1)",
  margin: "0 4px",
  flexShrink: 0,
};

function navLinkStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: "11px",
    color: active ? "#d4954a" : "#5a4a3a",
    textDecoration: "none",
    padding: "3px 8px",
    borderRadius: "4px",
    border: active ? "1px solid rgba(184,121,58,0.4)" : "1px solid transparent",
    background: active ? "rgba(184,121,58,0.1)" : "transparent",
    fontFamily: F,
    whiteSpace: "nowrap" as const,
    fontWeight: active ? 600 : 400,
    transition: "all 150ms ease",
  };
}

const currentPageStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#d4954a",
  padding: "3px 8px",
  borderRadius: "4px",
  border: "1px solid rgba(184,121,58,0.4)",
  background: "rgba(184,121,58,0.1)",
  fontFamily: F,
  whiteSpace: "nowrap" as const,
  fontWeight: 600,
};

const taglineStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#3a2e26",
  fontFamily: F,
  whiteSpace: "nowrap" as const,
};
