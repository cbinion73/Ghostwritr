/**
 * The spine — shared stage navigation for standalone stage pages ("rooms").
 * A dark bottle-green book spine with a gilt edge; the hallway of the
 * publishing house. Server component; pure render.
 */

import Link from "next/link";
import type { StageKey } from "@prisma/client";
import { STAGE_LINKS } from "@/lib/navigation";

export function StageSpine({
  slug,
  activeKey,
  bookTitle,
  statusLine,
}: {
  slug: string;
  activeKey: StageKey;
  bookTitle: string | null;
  statusLine?: string;
}) {
  return (
    <aside style={s.spine}>
      <div style={s.head}>
        <div className="microlabel" style={{ color: "var(--gold-bright)" }}>
          Ghostwritr · Manuscript
        </div>
        <div style={s.title}>{bookTitle ?? "Untitled"}</div>
        {statusLine ? <div style={s.status}>{statusLine}</div> : null}
      </div>
      <div style={s.list}>
        {STAGE_LINKS.map((stage) => {
          const active = stage.key === activeKey;
          return (
            <Link
              key={stage.key}
              href={stage.href(slug)}
              style={{ ...s.item, ...(active ? s.itemActive : null) }}
            >
              {stage.label}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

const s: Record<string, React.CSSProperties> = {
  spine: {
    background:
      "linear-gradient(105deg, var(--spine-deep) 0%, var(--spine) 22%, var(--spine) 88%, var(--spine-deep) 100%)",
    borderRadius: 8,
    borderRight: "2px solid rgba(201,162,75,0.45)",
    boxShadow: "inset -12px 0 24px -14px rgba(0,0,0,0.55)",
    color: "var(--spine-ink)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    alignSelf: "start",
    position: "sticky",
    top: 24,
  },
  head: {
    padding: "20px 18px 16px",
    borderBottom: "1px solid rgba(223,216,196,0.14)",
  },
  title: {
    fontSize: "1.15rem",
    fontStyle: "italic",
    lineHeight: 1.25,
    color: "#f3eedd",
    marginTop: 8,
  },
  status: {
    fontFamily: "var(--mono)" as string,
    fontSize: 10,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--spine-dim)",
    marginTop: 8,
  },
  list: {
    padding: "10px 8px 16px",
    display: "grid",
    gap: 1,
  },
  item: {
    padding: "7px 12px",
    fontSize: "13px",
    color: "#cfc9b6",
    borderLeft: "3px solid transparent",
    borderRadius: 3,
  },
  itemActive: {
    borderLeftColor: "var(--gold-bright)",
    background: "linear-gradient(90deg, rgba(201,162,75,0.16), rgba(201,162,75,0))",
    color: "#fbf7ea",
    fontStyle: "italic",
  },
};
