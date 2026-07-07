"use client";

import { useEffect, useMemo, useState } from "react";

interface ChapterStageCost {
  chapterKey: string;
  stageRole: string;
  costUsd: number;
  totalTokens: number;
  callCount: number;
}

interface UsageData {
  totalCostUsd: number;
  totalTokens: number;
  totalCalls: number;
  breakdown: { stageRole: string; costUsd: number; totalTokens: number; callCount: number }[];
  byChapterAndStage: ChapterStageCost[];
}

const fmtCost   = (n: number) => `$${n.toFixed(4)}`;
const fmtTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : String(n);

/** Chapter-key slugs aren't naturally sortable into outline order (they're
 * prefixed by section name, not a global sequence number) — alphabetical is
 * a reasonable, honest default until this is joined against real outline
 * ordering. "(book-level)" (non-chapter-scoped stages) always sorts last. */
function compareChapterKeys(a: string, b: string) {
  if (a === "(book-level)") return 1;
  if (b === "(book-level)") return -1;
  return a.localeCompare(b);
}

function CostBreakdownModal({ slug, onClose }: { slug: string; onClose: () => void }) {
  const [data, setData] = useState<ChapterStageCost[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/books/${slug}/llm-usage`);
        if (!res.ok) return;
        const json = await res.json() as UsageData;
        if (!cancelled) setData(json.byChapterAndStage);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [slug]);

  const { chapters, stages, matrix, chapterTotals, stageTotals, grandTotal } = useMemo(() => {
    const rows = data ?? [];
    const chapterSet = new Set<string>();
    const stageSet = new Set<string>();
    const cellMap = new Map<string, number>();
    let total = 0;

    for (const row of rows) {
      chapterSet.add(row.chapterKey);
      stageSet.add(row.stageRole);
      cellMap.set(`${row.chapterKey}::${row.stageRole}`, row.costUsd);
      total += row.costUsd;
    }

    const chapterList = Array.from(chapterSet).sort(compareChapterKeys);
    const stageList = Array.from(stageSet).sort((a, b) => a.localeCompare(b));

    const chTotals = new Map<string, number>();
    const stTotals = new Map<string, number>();
    for (const row of rows) {
      chTotals.set(row.chapterKey, (chTotals.get(row.chapterKey) ?? 0) + row.costUsd);
      stTotals.set(row.stageRole, (stTotals.get(row.stageRole) ?? 0) + row.costUsd);
    }

    return {
      chapters: chapterList,
      stages: stageList,
      matrix: cellMap,
      chapterTotals: chTotals,
      stageTotals: stTotals,
      grandTotal: total,
    };
  }, [data]);

  const cellStyle: React.CSSProperties = {
    padding: "6px 10px",
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  };
  const headCellStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 600,
    fontSize: "10px",
    letterSpacing: "0.03em",
    color: "var(--muted, #9ca3af)",
    textTransform: "uppercase",
    borderBottom: "1px solid rgba(255,255,255,0.15)",
  };
  const rowLabelStyle: React.CSSProperties = {
    padding: "6px 10px",
    fontSize: "11px",
    whiteSpace: "nowrap",
    textAlign: "left",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1410",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 10,
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
          maxWidth: "min(1100px, 92vw)",
          maxHeight: "86vh",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          color: "var(--fg, #e2e8f0)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Cost by chapter &amp; stage</div>
            <div style={{ fontSize: 11, color: "var(--muted, #9ca3af)", marginTop: 2 }}>
              {loading ? "Loading…" : `Total: ${fmtCost(grandTotal)} across ${chapters.length} chapter${chapters.length === 1 ? "" : "s"}-and-book-level rows`}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, color: "inherit", padding: "4px 10px", cursor: "pointer", fontSize: 12 }}
          >
            Close
          </button>
        </div>

        <div style={{ overflow: "auto", padding: "8px 20px 20px" }}>
          {loading ? (
            <div style={{ padding: 20, fontSize: 12, color: "var(--muted, #9ca3af)" }}>Loading cost data…</div>
          ) : chapters.length === 0 ? (
            <div style={{ padding: 20, fontSize: 12, color: "var(--muted, #9ca3af)" }}>No LLM calls logged yet for this book.</div>
          ) : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ ...headCellStyle, textAlign: "left" }}>Chapter</th>
                  {stages.map((stage) => (
                    <th key={stage} style={headCellStyle}>{stage.replace(/_/g, " ").toLowerCase()}</th>
                  ))}
                  <th style={headCellStyle}>Total</th>
                </tr>
              </thead>
              <tbody>
                {chapters.map((chapterKey) => (
                  <tr key={chapterKey} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <td style={{ ...rowLabelStyle, fontStyle: chapterKey === "(book-level)" ? "italic" : "normal", opacity: chapterKey === "(book-level)" ? 0.75 : 1 }}>
                      {chapterKey}
                    </td>
                    {stages.map((stage) => {
                      const cost = matrix.get(`${chapterKey}::${stage}`);
                      return (
                        <td key={stage} style={{ ...cellStyle, opacity: cost ? 1 : 0.3 }}>
                          {cost ? fmtCost(cost) : "—"}
                        </td>
                      );
                    })}
                    <td style={{ ...cellStyle, fontWeight: 600 }}>{fmtCost(chapterTotals.get(chapterKey) ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "1px solid rgba(255,255,255,0.15)" }}>
                  <td style={{ ...rowLabelStyle, fontWeight: 600 }}>Total</td>
                  {stages.map((stage) => (
                    <td key={stage} style={{ ...cellStyle, fontWeight: 600 }}>{fmtCost(stageTotals.get(stage) ?? 0)}</td>
                  ))}
                  <td style={{ ...cellStyle, fontWeight: 700 }}>{fmtCost(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export function CostPaceBar({ slug }: { slug: string }) {
  const [usage, setUsage]       = useState<UsageData | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/books/${slug}/llm-usage`);
        if (!res.ok) return;
        const data = await res.json() as UsageData;
        if (!cancelled) setUsage(data);
      } catch {
        // non-fatal
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [slug]);

  if (!usage || usage.totalCalls === 0) return null;

  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    color: "var(--muted, #6b7280)",
    letterSpacing: "0.04em",
  };
  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    gap: 6,
  };
  const valueStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--fg, #e2e8f0)",
  };
  const expandedPanelStyle: React.CSSProperties = {
    marginTop: 6,
    fontSize: "10px",
    color: "var(--muted, #6b7280)",
    lineHeight: 1.7,
  };
  const stageNameStyle: React.CSSProperties = {
    fontFamily: "monospace",
    fontSize: "9px",
    opacity: 0.8,
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={rowStyle}>
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ ...labelStyle, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          title="Toggle per-role cost breakdown"
        >
          LLM cost ({usage.totalCalls} calls) {usage.breakdown.length > 0 ? (expanded ? "▴" : "▾") : ""}
        </button>
        <button
          onClick={() => setModalOpen(true)}
          style={{ ...valueStyle, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "none", borderBottom: "1px dotted rgba(255,255,255,0.25)" }}
          title="View cost by chapter and stage"
        >
          {fmtCost(usage.totalCostUsd)}
        </button>
      </div>
      <div style={{ ...rowStyle, marginTop: 2 }}>
        <span style={labelStyle}>Tokens used</span>
        <span style={{ ...valueStyle, fontWeight: 400 }}>{fmtTokens(usage.totalTokens)}</span>
      </div>

      {expanded && usage.breakdown.length > 0 && (
        <div
          style={{
            ...expandedPanelStyle,
            position: "absolute",
            top: "100%",
            right: 0,
            zIndex: 60,
            minWidth: 240,
            padding: "10px 12px",
            background: "#1a1410",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
          }}
        >
          {usage.breakdown.map((row) => (
            <div
              key={row.stageRole}
              style={{ display: "flex", justifyContent: "space-between", gap: 6 }}
            >
              <span style={stageNameStyle}>{row.stageRole.replace(/_/g, " ").toLowerCase()}</span>
              <span style={{ fontWeight: 600 }}>{fmtCost(row.costUsd)}</span>
            </div>
          ))}
        </div>
      )}

      {modalOpen && <CostBreakdownModal slug={slug} onClose={() => setModalOpen(false)} />}
    </div>
  );
}
