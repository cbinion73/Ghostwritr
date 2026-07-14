import Link from "next/link";
import { AppTopBar } from "@/app/components/app-top-bar";
import { db } from "@/lib/db";
import { getBookStageLinks } from "@/lib/navigation";
import { resolveModelSpec } from "@/lib/llm/routing";
import { getModelPricing } from "@/lib/llm/pricing";
import { getCanonicalCostLedgerForBook, readCostLog } from "@/lib/llm/call-log";
import type { StageRole } from "@/lib/llm/routing";
import { BookWorkflowType, type StageKey } from "@prisma/client";
import { getWorkflowDefinition } from "@/lib/workflow-registry";

// ── Stage configuration ─────────────────────────────────────────────────────
// Each row: how the nonfiction workflow maps to an agent, role, and model.
// "multiplier" = repeats per chapter (for Research / External Stories / Chapter Draft)

interface StageConfig {
  stageKey:   StageKey;
  label:      string;
  agentName:  string;
  stageRole:  StageRole;
  note?:      string;         // shown when two stages share a role
  perChapter: boolean;        // true = one LLM call per outline chapter
}

const COST_STAGE_DETAILS: Partial<
  Record<StageKey, Omit<StageConfig, "stageKey" | "label">>
> = {
  BOOK_SETUP:       { agentName: "Blueprint",    stageRole: "setup:voice-blending",        perChapter: false },
  PROMISE:          { agentName: "Sage",         stageRole: "promise:author",              perChapter: false },
  OUTLINE:          { agentName: "Cartographer", stageRole: "outline:phase-1",             perChapter: false },
  BASE_STORY:       { agentName: "Narrator",     stageRole: "base-story:author",           perChapter: false },
  RESEARCH:         { agentName: "Scout",        stageRole: "research:agent-1-researcher", perChapter: true  },
  EXTERNAL_STORIES: { agentName: "Chronicle",    stageRole: "external-stories:extract",    perChapter: true  },
  PERSONAL_STORIES: { agentName: "Muse",         stageRole: "personal-stories:interview",  perChapter: false },
  CHAPTER_DRAFT:    { agentName: "Quill",        stageRole: "chapter-draft:author",        perChapter: true  },
  EDITING:          { agentName: "Meridian",     stageRole: "final-editor:polish",         perChapter: false },
};

function getCostStageConfigs(workflowType: BookWorkflowType): StageConfig[] {
  return getWorkflowDefinition(workflowType).stages.flatMap((stage) => {
    const details = COST_STAGE_DETAILS[stage.key];
    if (!details) return [];
    return [{
      stageKey: stage.key,
      label: stage.label,
      ...details,
    }];
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function charsToTokens(chars: number) { return Math.round(chars / 4); }

/** Typical input context (system prompt + prior stage context) per stage */
const INPUT_TOKEN_ESTIMATE: Partial<Record<StageKey, number>> = {
  BOOK_SETUP:       2_000,
  PROMISE:          3_000,
  MARKET_ANALYSIS:  4_000,
  OUTLINE:          5_000,
  BASE_STORY:       6_000,
  RESEARCH:         4_000,
  EXTERNAL_STORIES: 4_000,
  PERSONAL_STORIES: 3_000,
  CHAPTER_DRAFT:    12_000,  // context-heavy: outline + research + story dossiers
  EDITING:          20_000,  // entire manuscript
};

function fmtCost(n: number) {
  if (n === 0) return "—";
  if (n < 0.0001) return "<$0.0001";
  return `$${n.toFixed(4)}`;
}
function fmtTokens(n: number) {
  if (n === 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function CostAnalysisPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const book = await db.book.findUnique({
    where: { slug },
    select: { id: true, titleWorking: true, workflowType: true },
  });
  if (!book) return <div className="page-shell"><p>Book not found.</p></div>;

  const stageLinks = getBookStageLinks(book.workflowType, slug);

  // All stages for this book
  const bookStages = await db.bookStage.findMany({
    where: { bookId: book.id },
    select: {
      stageKey: true,
      status: true,
      artifacts: {
        select: {
          versions: {
            where: { lifecycleState: "COMMITTED" },
            select: { contentText: true },
            orderBy: { versionNumber: "desc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const stageMap = new Map(bookStages.map((s) => [s.stageKey, s]));

  // Canonical LLMCallLog actual costs — grouped by recorded stage key,
  // operation, generation mode, and status. Role is displayed for audit detail
  // but no longer drives stage attribution.
  const canonicalLedger = await getCanonicalCostLedgerForBook(book.id);
  const actualByStage = new Map<string, { costUsd: number; totalTokens: number; callCount: number }>();
  for (const row of canonicalLedger) {
    const existing = actualByStage.get(row.stageKey) ?? { costUsd: 0, totalTokens: 0, callCount: 0 };
    existing.costUsd += row.costUsd;
    existing.totalTokens += row.totalTokens;
    existing.callCount += row.callCount;
    actualByStage.set(row.stageKey, existing);
  }

  // Count committed chapters (for per-chapter estimates)
  const chapterCount = (() => {
    const outlineStage = stageMap.get("OUTLINE");
    const outlineText = outlineStage?.artifacts[0]?.versions[0]?.contentText ?? "";
    if (!outlineText) return 10; // default estimate
    // Count "Chapter" occurrences as a rough proxy
    const matches = outlineText.match(/\bchapter\b/gi);
    const count = matches ? Math.max(5, Math.min(50, matches.length)) : 10;
    return count;
  })();

  // ── Build rows ──────────────────────────────────────────────────────────
  type Row = {
    config:         StageConfig;
    modelSpec:      string;
    modelLabel:     string;
    inputPer1M:     number;
    outputPer1M:    number;
    status:         string;
    artifactTokens: number;   // output tokens estimated from artifact size
    inputEstimate:  number;   // input tokens estimate
    estCost:        number;
    actualCost:     number;
    actualTokens:   number;
    callCount:      number;
    multiplier:     number;   // how many LLM calls (1 or chapterCount)
  };

  const rows: Row[] = getCostStageConfigs(book.workflowType).map((config) => {
    const modelSpec  = resolveModelSpec(config.stageRole);
    const pricing    = getModelPricing(modelSpec);
    const stage      = stageMap.get(config.stageKey);
    const status     = stage?.status ?? "NOT_STARTED";
    const multiplier = config.perChapter ? chapterCount : 1;

    // Sum all artifact content lengths for this stage
    const totalArtifactChars = (stage?.artifacts ?? []).reduce((sum, a) => {
      const text = a.versions[0]?.contentText ?? "";
      return sum + text.length;
    }, 0);
    const artifactTokens = charsToTokens(totalArtifactChars);

    // Input estimate: use hardcoded per-stage estimate × multiplier
    const inputPerCall  = INPUT_TOKEN_ESTIMATE[config.stageKey] ?? 3_000;
    const inputEstimate = inputPerCall * multiplier;

    // Output estimate: if we have actual artifacts use them; otherwise use generic range
    const outputEstimate = artifactTokens > 0
      ? artifactTokens
      : multiplier * (config.perChapter ? 3_000 : 4_000);

    const estCost =
      (inputEstimate  / 1_000_000) * pricing.inputPer1M +
      (outputEstimate / 1_000_000) * pricing.outputPer1M;

    const actual = actualByStage.get(config.stageKey);
    const actualCost   = actual?.costUsd ?? 0;
    const actualTokens = actual?.totalTokens ?? 0;
    const callCount    = actual?.callCount ?? 0;

    return {
      config,
      modelSpec,
      modelLabel:    pricing.label,
      inputPer1M:    pricing.inputPer1M,
      outputPer1M:   pricing.outputPer1M,
      status,
      artifactTokens,
      inputEstimate,
      estCost,
      actualCost,
      actualTokens,
      callCount,
      multiplier,
    };
  });

  const totalEstCost    = rows.reduce((s, r) => s + r.estCost, 0);
  const totalActualCost = canonicalLedger.reduce((s, r) => s + r.costUsd, 0);
  const totalActualToks = canonicalLedger.reduce((s, r) => s + r.totalTokens, 0);
  const totalActualCalls = canonicalLedger.reduce((s, r) => s + r.callCount, 0);

  // ── Flat log — all books, all time ──────────────────────────────────────
  const allLogEntries = readCostLog();

  // Aggregate by (bookSlug + date) for a daily summary view
  const dailyMap = new Map<string, { date: string; bookTitle: string; bookSlug: string; costUsd: number; totalTokens: number; calls: number }>();
  for (const entry of allLogEntries) {
    const date = entry.ts.slice(0, 10); // YYYY-MM-DD
    const key  = `${date}::${entry.bookSlug}`;
    const existing = dailyMap.get(key);
    if (existing) {
      existing.costUsd      += entry.costUsd;
      existing.totalTokens  += entry.totalTokens;
      existing.calls        += 1;
    } else {
      dailyMap.set(key, {
        date,
        bookSlug:   entry.bookSlug,
        bookTitle:  entry.bookTitle,
        costUsd:    entry.costUsd,
        totalTokens: entry.totalTokens,
        calls: 1,
      });
    }
  }
  const dailySummary = Array.from(dailyMap.values()).sort((a, b) => b.date.localeCompare(a.date));

  // All-time totals from flat log
  const logTotalCost   = allLogEntries.reduce((s, e) => s + e.costUsd, 0);
  const logTotalTokens = allLogEntries.reduce((s, e) => s + e.totalTokens, 0);

  // Per-book totals from flat log
  const bookTotalsMap = new Map<string, { bookSlug: string; bookTitle: string; costUsd: number; totalTokens: number; calls: number }>();
  for (const entry of allLogEntries) {
    const existing = bookTotalsMap.get(entry.bookSlug);
    if (existing) {
      existing.costUsd     += entry.costUsd;
      existing.totalTokens += entry.totalTokens;
      existing.calls       += 1;
    } else {
      bookTotalsMap.set(entry.bookSlug, {
        bookSlug:    entry.bookSlug,
        bookTitle:   entry.bookTitle,
        costUsd:     entry.costUsd,
        totalTokens: entry.totalTokens,
        calls: 1,
      });
    }
  }
  const bookTotals = Array.from(bookTotalsMap.values()).sort((a, b) => b.costUsd - a.costUsd);

  // ── Styles ──────────────────────────────────────────────────────────────
  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "13px",
  };
  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    fontSize: "11px",
    fontWeight: 600,
    color: "var(--muted, #6b7280)",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "9px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    verticalAlign: "middle",
  };
  const numStyle: React.CSSProperties = {
    ...tdStyle,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
    fontFamily: "monospace",
    fontSize: "12px",
  };
  const statusStyle = (s: string): React.CSSProperties => ({
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: "10px",
    fontWeight: 600,
    letterSpacing: "0.04em",
    background:
      s === "COMMITTED"        ? "rgba(34,197,94,0.15)"  :
      s === "IN_PROGRESS"      ? "rgba(59,130,246,0.15)" :
      s === "READY_FOR_REVIEW" ? "rgba(234,179,8,0.15)"  :
                                  "rgba(255,255,255,0.06)",
    color:
      s === "COMMITTED"        ? "#4a7c59" :
      s === "IN_PROGRESS"      ? "#60a5fa" :
      s === "READY_FOR_REVIEW" ? "#facc15" :
                                  "#6f6256",
  });
  const modelTagStyle: React.CSSProperties = {
    display: "inline-block",
    padding: "2px 7px",
    borderRadius: 4,
    fontSize: "10px",
    fontWeight: 600,
    background: "rgba(255,255,255,0.06)",
    color: "#e8d5b0",
    fontFamily: "monospace",
  };
  const totalRowStyle: React.CSSProperties = {
    borderTop: "2px solid rgba(255,255,255,0.12)",
    fontWeight: 700,
  };
  const noteStyle: React.CSSProperties = {
    fontSize: "10px",
    color: "#6f6256",
    display: "block",
    marginTop: 2,
  };

  return (
    <div className="dark-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppTopBar bookSlug={slug} bookTitle={book.titleWorking ?? undefined} activePage="studio" />
      <div className="page-shell" style={{ flex: 1 }}>
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">LLM cost analysis — per stage breakdown.</p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>Book: <strong>{book.titleWorking ?? "Untitled"}</strong></div>
          <div style={{ marginTop: 6 }}>Chapter estimate: <strong>{chapterCount} chapters</strong></div>
        </div>

        <div className="stage-list">
          {stageLinks.map((stage) => (
            <Link key={stage.key} href={stage.href} className="stage-chip">
              {stage.label}
            </Link>
          ))}
        </div>
      </aside>

      <main className="main-column">
        <section className="glass-panel topbar">
          <div>
            <div className="label">Book Analytics</div>
            <h2>Cost Analysis</h2>
            <div className="muted">
              Per-stage LLM model, token pricing, estimated cost from artifact sizes, and actual logged cost.
              Estimated = computed from generated artifact sizes + typical input context.
              Actual = logged from completed LLM calls (accumulates from session onwards).
            </div>
          </div>
          <div className="button-row">
            <Link className="btn" href={`/books/${slug}`}>
              Back to Workspace
            </Link>
          </div>
        </section>

        <section className="glass-panel section-panel">
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Stage</th>
                <th style={thStyle}>Agent</th>
                <th style={thStyle}>Model</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Input $/1M</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Output $/1M</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                <th style={{ ...thStyle, textAlign: "right" }}>LLM Calls</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Est. Tokens</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Est. Cost</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Actual Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.config.stageKey}>
                  <td style={tdStyle}>
                    <strong>{r.config.label}</strong>
                    {r.config.perChapter && (
                      <span style={noteStyle}>× {r.multiplier} chapters</span>
                    )}
                    {r.config.note && (
                      <span style={noteStyle}>{r.config.note}</span>
                    )}
                  </td>
                  <td style={tdStyle}>{r.config.agentName}</td>
                  <td style={tdStyle}>
                    <span style={modelTagStyle}>{r.modelLabel}</span>
                  </td>
                  <td style={numStyle}>${r.inputPer1M.toFixed(2)}</td>
                  <td style={numStyle}>${r.outputPer1M.toFixed(2)}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <span style={statusStyle(r.status)}>
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td style={numStyle}>
                    {r.callCount > 0 ? r.callCount : "—"}
                  </td>
                  <td style={numStyle}>
                    {r.artifactTokens > 0
                      ? fmtTokens(r.inputEstimate + r.artifactTokens)
                      : <span style={{ color: "#6f6256" }}>~{fmtTokens(r.inputEstimate + (r.config.perChapter ? chapterCount * 3_000 : 4_000))}</span>
                    }
                  </td>
                  <td style={numStyle}>{fmtCost(r.estCost)}</td>
                  <td style={{
                    ...numStyle,
                    color: r.actualCost > 0 ? "#4a7c59" : undefined,
                  }}>
                    {r.actualCost > 0 ? fmtCost(r.actualCost) : "—"}
                  </td>
                </tr>
              ))}

              {/* Totals row */}
              <tr style={totalRowStyle}>
                <td style={tdStyle} colSpan={7}>Total</td>
                <td style={numStyle}>{fmtTokens(rows.reduce((s, r) => s + r.inputEstimate + r.artifactTokens, 0))}</td>
                <td style={{ ...numStyle, color: "#e8d5b0" }}>{fmtCost(totalEstCost)}</td>
                <td style={{ ...numStyle, color: totalActualCost > 0 ? "#4a7c59" : undefined }}>
                  {totalActualCost > 0 ? fmtCost(totalActualCost) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Pricing reference */}
        <section className="glass-panel section-panel">
          <div className="section-header">
            <h3>Pricing Reference</h3>
            <div className="muted">Models currently configured for this workflow.</div>
          </div>
          <div className="workspace-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {Array.from(
              new Map(rows.map((r) => [r.modelLabel, r])).values()
            ).map((r) => (
              <div className="card" key={r.modelLabel} style={{ padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: "13px" }}>{r.modelLabel}</div>
                <div className="muted" style={{ marginTop: 4, fontSize: "12px" }}>
                  Input: <strong>${r.inputPer1M.toFixed(2)}</strong> / 1M tokens
                </div>
                <div className="muted" style={{ fontSize: "12px" }}>
                  Output: <strong>${r.outputPer1M.toFixed(2)}</strong> / 1M tokens
                </div>
                <div className="muted" style={{ fontSize: "11px", marginTop: 4 }}>
                  Used by:{" "}
                  {rows
                    .filter((x) => x.modelLabel === r.modelLabel)
                    .map((x) => x.config.label)
                    .join(", ")}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Actual cost log — only shown if there is data */}
        {totalActualCost > 0 && (
          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>Actual Cost Log</h3>
              <div className="muted">
                {totalActualCost > 0 && (
                  <span>
                    Total logged: <strong style={{ color: "#4a7c59" }}>{fmtCost(totalActualCost)}</strong>
                    {" "} across <strong>{totalActualCalls}</strong> LLM calls
                    {" "}({fmtTokens(totalActualToks)} tokens)
                  </span>
                )}
              </div>
            </div>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Stage</th>
                  <th style={thStyle}>Operation</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Mode</th>
                  <th style={thStyle}>Stage Role</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Calls</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Tokens</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Search</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Cost</th>
                </tr>
              </thead>
              <tbody>
                {canonicalLedger
                  .sort((a, b) => b.costUsd - a.costUsd)
                  .map((r) => (
                    <tr key={`${r.stageKey}:${r.operation}:${r.generationMode}:${r.status}:${r.stageRole}`}>
                      <td style={tdStyle}>
                        <span style={modelTagStyle}>{r.stageKey}</span>
                      </td>
                      <td style={tdStyle}>{r.operation}</td>
                      <td style={tdStyle}>{r.status}</td>
                      <td style={tdStyle}>{r.generationMode}</td>
                      <td style={tdStyle}>
                        <span style={modelTagStyle}>{r.stageRole}</span>
                      </td>
                      <td style={numStyle}>{r.callCount}</td>
                      <td style={numStyle}>{fmtTokens(r.totalTokens)}</td>
                      <td style={numStyle}>{fmtCost(r.searchCostUsd)}</td>
                      <td style={{ ...numStyle, color: "#4a7c59" }}>
                        {fmtCost(r.costUsd)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        )}
        {/* ── Cross-book history (from flat log file) ── */}
        {allLogEntries.length > 0 && (
          <>
            {/* Per-book totals */}
            <section className="glass-panel section-panel">
              <div className="section-header">
                <h3>All-Time Cost by Book</h3>
                <div className="muted">
                  From <code style={{ fontSize: "11px" }}>data/llm-cost-log.jsonl</code> —
                  total across all books: <strong style={{ color: "#4a7c59" }}>{fmtCost(logTotalCost)}</strong>{" "}
                  ({fmtTokens(logTotalTokens)} tokens, {allLogEntries.length} calls)
                </div>
              </div>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Book</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Calls</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Tokens</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {bookTotals.map((b) => (
                    <tr key={b.bookSlug} style={b.bookSlug === slug ? { background: "rgba(255,255,255,0.03)" } : undefined}>
                      <td style={tdStyle}>
                        <Link href={`/books/${b.bookSlug}/cost-analysis`} style={{ color: "inherit", textDecoration: "none" }}>
                          <strong>{b.bookTitle}</strong>
                          {b.bookSlug === slug && (
                            <span style={{ ...noteStyle, display: "inline", marginLeft: 6, color: "#60a5fa" }}>← current</span>
                          )}
                        </Link>
                      </td>
                      <td style={numStyle}>{b.calls}</td>
                      <td style={numStyle}>{fmtTokens(b.totalTokens)}</td>
                      <td style={{ ...numStyle, color: "#4a7c59" }}>{fmtCost(b.costUsd)}</td>
                    </tr>
                  ))}
                  <tr style={totalRowStyle}>
                    <td style={tdStyle} colSpan={3}>All books total</td>
                    <td style={{ ...numStyle, color: "#4a7c59" }}>{fmtCost(logTotalCost)}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {/* Daily activity log */}
            {dailySummary.length > 0 && (
              <section className="glass-panel section-panel">
                <div className="section-header">
                  <h3>Daily Activity Log</h3>
                  <div className="muted">Every day an LLM call was made, across all books.</div>
                </div>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Date</th>
                      <th style={thStyle}>Book</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Calls</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Tokens</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySummary.slice(0, 60).map((d) => (
                      <tr key={`${d.date}-${d.bookSlug}`}>
                        <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: "12px" }}>{d.date}</td>
                        <td style={tdStyle}>
                          <Link href={`/books/${d.bookSlug}/cost-analysis`} style={{ color: "inherit", textDecoration: "none" }}>
                            {d.bookTitle}
                          </Link>
                        </td>
                        <td style={numStyle}>{d.calls}</td>
                        <td style={numStyle}>{fmtTokens(d.totalTokens)}</td>
                        <td style={{ ...numStyle, color: "#4a7c59" }}>{fmtCost(d.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </main>
      </div>
    </div>
  );
}
