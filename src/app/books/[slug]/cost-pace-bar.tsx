"use client";

import { useEffect, useState } from "react";

interface UsageData {
  totalCostUsd: number;
  totalTokens: number;
  totalCalls: number;
  breakdown: { stageRole: string; costUsd: number; totalTokens: number; callCount: number }[];
}

export function CostPaceBar({ slug }: { slug: string }) {
  const [usage, setUsage]       = useState<UsageData | null>(null);
  const [expanded, setExpanded] = useState(false);

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

  const fmtCost   = (n: number) => `$${n.toFixed(4)}`;
  const fmtTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : String(n);

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
    <div>
      <div style={rowStyle}>
        <span style={labelStyle}>LLM cost ({usage.totalCalls} calls)</span>
        <a
          href={`/books/${slug}/cost-analysis`}
          style={{ ...valueStyle, textDecoration: "none", borderBottom: "1px dotted rgba(255,255,255,0.25)" }}
          title="View full cost analysis"
        >
          {fmtCost(usage.totalCostUsd)}
        </a>
      </div>
      <div style={{ ...rowStyle, marginTop: 2 }}>
        <span style={labelStyle}>Tokens used</span>
        <span style={{ ...valueStyle, fontWeight: 400 }}>{fmtTokens(usage.totalTokens)}</span>
      </div>

      {usage.breakdown.length > 0 && (
        <div style={expandedPanelStyle}>
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
    </div>
  );
}
