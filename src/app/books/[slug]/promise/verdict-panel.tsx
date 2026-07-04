/**
 * The Verdict — Promise stage rendered as a gate judgment, not a report.
 * Verdict band (composite score vs. the gate), dimension ledger, and the
 * examiner's notes from the PROMISE_SCORECARD artifact.
 */

import type { PromiseScorecard } from "@/lib/promise-types";

const GATE = 7.0; // 1–10 scale; the stage's hard viability gate.

const DIMENSION_LABELS: Record<keyof PromiseScorecard["scores"], string> = {
  clarity: "Promise Clarity",
  audienceFit: "Audience Fit",
  distinctiveness: "Distinctiveness",
  commercialPull: "Commercial Pull",
  credibility: "Author Credibility",
};

export function compositeScore(scorecard: PromiseScorecard): number {
  const values = Object.values(scorecard.scores);
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function VerdictPanel({
  scorecard,
  committed,
}: {
  scorecard: PromiseScorecard | null;
  committed: boolean;
}) {
  if (!scorecard) {
    return (
      <section style={s.band}>
        <div>
          <span className="microlabel" style={s.microMuted}>Composite Score</span>
          <div style={{ ...s.scoreNum, color: "var(--muted)" }}>—</div>
          <p style={s.examinerNote}>
            No scorecard on file yet. Work the promise conversationally and a verdict
            will be rendered when the promise is extracted.
          </p>
        </div>
      </section>
    );
  }

  const composite = compositeScore(scorecard);
  const clearsGate = composite >= GATE;
  const compositePct = Math.min(100, (composite / 10) * 100);
  const gatePct = (GATE / 10) * 100;

  const dimensions = (
    Object.entries(scorecard.scores) as [keyof PromiseScorecard["scores"], number][]
  ).map(([key, score]) => ({
    key,
    label: DIMENSION_LABELS[key] ?? key,
    score,
    belowGate: score < GATE,
  }));

  return (
    <>
      {/* ── Verdict band ── */}
      <section style={s.band}>
        <div style={s.scoreBlock}>
          <span className="microlabel" style={s.microMuted}>Composite Score</span>
          <div style={{ ...s.scoreNum, color: clearsGate ? "var(--green-ink)" : "var(--rust)" }}>
            {composite.toFixed(1)}
            <span style={s.scoreOf}> / 10</span>
          </div>
        </div>

        <div style={s.railWrap}>
          <div style={s.rail}>
            <div
              style={{
                ...s.railFill,
                width: `${compositePct}%`,
                background: clearsGate
                  ? "linear-gradient(90deg, #6d8e6f, var(--green-ink))"
                  : "linear-gradient(90deg, #c08a72, var(--rust))",
              }}
            />
            <div style={{ ...s.gateMark, left: `${gatePct}%` }}>
              <span style={s.gateMarkLabel}>GATE {GATE.toFixed(1)}</span>
            </div>
            <div style={{ ...s.needle, left: `${compositePct}%` }} />
          </div>
          <div style={s.railScale}>
            {[0, 2, 4, 6, 8, 10].map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </div>

        <div
          style={{
            ...s.stamp,
            borderColor: clearsGate ? "var(--green-ink)" : "var(--rust)",
            color: clearsGate ? "var(--green-ink)" : "var(--rust)",
          }}
        >
          <div style={s.stampBig}>
            {committed ? "Committed" : clearsGate ? "Clears the Gate" : "Below the Gate"}
          </div>
          <div style={s.stampSmall}>
            {composite.toFixed(1)} {clearsGate ? "≥" : "<"} {GATE.toFixed(1)} · promise assay
          </div>
        </div>
      </section>

      {/* ── Dimension ledger ── */}
      <section style={s.ledger}>
        <div style={s.ledgerHead}>
          <h3 style={s.ledgerTitle}>The Five Dimensions</h3>
          <span className="microlabel" style={s.microMuted}>gate line at {GATE.toFixed(1)}</span>
        </div>
        {dimensions.map((dim, i) => (
          <div key={dim.key} style={s.dimLine}>
            <span style={s.dimIdx}>{String(i + 1).padStart(2, "0")}</span>
            <span style={s.dimName}>
              {dim.label}
              {dim.belowGate && <span style={s.dimFlag}>below gate</span>}
            </span>
            <span style={s.dimBar}>
              <span
                style={{
                  ...s.dimFill,
                  width: `${(dim.score / 10) * 100}%`,
                  background: dim.belowGate ? "var(--rust)" : "var(--green-ink)",
                }}
              />
              <span style={{ ...s.dimGateTick, left: `${gatePct}%` }} />
            </span>
            <span style={{ ...s.dimScore, color: dim.belowGate ? "var(--rust)" : "var(--ink)" }}>
              {dim.score.toFixed(1)}
            </span>
          </div>
        ))}
      </section>

      {/* ── Examiner's notes ── */}
      <section style={s.notesGrid}>
        {scorecard.strengths.length > 0 && (
          <div style={{ ...s.noteCol, borderLeftColor: "rgba(47,93,67,0.4)" }}>
            <span className="microlabel" style={{ color: "var(--green-ink)" }}>Strengths on file</span>
            {scorecard.strengths.map((item, i) => (
              <p key={i} style={{ ...s.noteText, color: "var(--green-ink)" }}>{item}</p>
            ))}
          </div>
        )}
        {scorecard.concerns.length > 0 && (
          <div style={{ ...s.noteCol, borderLeftColor: "rgba(165,70,47,0.4)" }}>
            <span className="microlabel" style={{ color: "var(--rust)" }}>Concerns</span>
            {scorecard.concerns.map((item, i) => (
              <p key={i} style={{ ...s.noteText, color: "var(--rust)" }}>{item}</p>
            ))}
          </div>
        )}
        {scorecard.nextBestRevisions.length > 0 && (
          <div style={{ ...s.noteCol, borderLeftColor: "rgba(154,124,57,0.5)" }}>
            <span className="microlabel" style={{ color: "var(--gold)" }}>Next best revisions</span>
            {scorecard.nextBestRevisions.map((item, i) => (
              <p key={i} style={{ ...s.noteText, color: "var(--muted)" }}>{item}</p>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

const s: Record<string, React.CSSProperties> = {
  band: {
    background: "var(--panel-solid)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "24px 28px 26px",
    display: "grid",
    gridTemplateColumns: "auto 1fr auto",
    gap: 32,
    alignItems: "center",
  },
  microMuted: { color: "var(--muted)", display: "block", marginBottom: 6 },
  scoreBlock: { minWidth: 130 },
  scoreNum: {
    fontSize: 64,
    lineHeight: 0.95,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: "-0.03em",
  },
  scoreOf: { fontSize: 20, color: "var(--muted)", fontWeight: 400, letterSpacing: 0 },
  railWrap: { alignSelf: "center", minWidth: 0 },
  rail: {
    position: "relative",
    height: 10,
    background: "var(--paper)",
    border: "1px solid var(--line)",
    borderRadius: 5,
    margin: "24px 6px 8px",
  },
  railFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: "5px 0 0 5px",
  },
  gateMark: {
    position: "absolute",
    top: -9,
    bottom: -9,
    width: 2,
    background: "var(--rust)",
  },
  gateMarkLabel: {
    position: "absolute",
    top: -17,
    left: "50%",
    transform: "translateX(-50%)",
    fontFamily: "var(--mono)" as string,
    fontSize: 9,
    letterSpacing: "0.1em",
    color: "var(--rust)",
    whiteSpace: "nowrap",
  },
  needle: {
    position: "absolute",
    top: -7,
    transform: "translateX(-50%)",
    width: 0,
    height: 0,
    borderLeft: "6px solid transparent",
    borderRight: "6px solid transparent",
    borderTop: "9px solid var(--ink)",
  },
  railScale: {
    display: "flex",
    justifyContent: "space-between",
    padding: "0 6px",
    fontFamily: "var(--mono)" as string,
    fontSize: 9,
    color: "var(--muted)",
  },
  examinerNote: {
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--muted)",
    fontStyle: "italic",
    marginTop: 12,
    maxWidth: "52ch",
  },
  stamp: {
    justifySelf: "end",
    alignSelf: "start",
    transform: "rotate(-6deg)",
    border: "2.5px solid",
    borderRadius: 6,
    padding: "9px 16px 11px",
    textAlign: "center",
    opacity: 0.9,
    mixBlendMode: "multiply",
  },
  stampBig: {
    fontFamily: "var(--mono)" as string,
    fontSize: 13,
    letterSpacing: "0.2em",
    fontWeight: 700,
    textTransform: "uppercase",
  },
  stampSmall: {
    fontFamily: "var(--mono)" as string,
    fontSize: 8,
    letterSpacing: "0.14em",
    marginTop: 4,
    textTransform: "uppercase",
  },
  ledger: {
    marginTop: 22,
    background: "var(--panel-solid)",
    border: "1px solid var(--line)",
    borderRadius: 6,
    padding: "18px 24px 10px",
  },
  ledgerHead: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    borderBottom: "2px solid var(--ink)",
    paddingBottom: 8,
    marginBottom: 4,
  },
  ledgerTitle: { margin: 0, fontSize: 17, fontWeight: 600 },
  dimLine: {
    display: "grid",
    gridTemplateColumns: "30px 200px 1fr 46px",
    gap: 14,
    alignItems: "center",
    padding: "12px 2px",
    borderBottom: "1px solid var(--line)",
  },
  dimIdx: { fontFamily: "var(--mono)" as string, fontSize: 10.5, color: "var(--muted)" },
  dimName: { fontSize: 15 },
  dimFlag: {
    fontFamily: "var(--mono)" as string,
    fontSize: 8.5,
    letterSpacing: "0.1em",
    color: "var(--rust)",
    border: "1px solid var(--rust)",
    borderRadius: 2,
    padding: "1px 5px",
    marginLeft: 8,
    verticalAlign: 2,
    textTransform: "uppercase",
  },
  dimBar: {
    position: "relative",
    height: 8,
    background: "var(--paper)",
    border: "1px solid var(--line)",
    borderRadius: 4,
    display: "block",
  },
  dimFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: "4px 0 0 4px",
    opacity: 0.85,
    display: "block",
  },
  dimGateTick: {
    position: "absolute",
    top: -4,
    bottom: -4,
    width: 1.5,
    background: "var(--rust)",
    opacity: 0.55,
    display: "block",
  },
  dimScore: {
    fontFamily: "var(--mono)" as string,
    fontSize: 13,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  },
  notesGrid: {
    marginTop: 22,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 18,
  },
  noteCol: {
    borderLeft: "2px solid",
    paddingLeft: 14,
    display: "grid",
    gap: 8,
    alignContent: "start",
  },
  noteText: { margin: 0, fontSize: 13.5, lineHeight: 1.5, fontStyle: "italic" },
};
