/**
 * The Typeset room — the real, deterministic Export & Publishing Pipeline,
 * absorbed from the retired standalone /publish page into the TYPESET stage
 * slot. Deliberately NOT an agent: it reads committed artifact state, runs
 * a validation report, and produces export packages. No prose is generated,
 * edited, or rewritten here — that is Editing's job. Typeset is where the
 * final document gets produced.
 */

import { getPublishPipelineData } from "@/lib/workflows/publish-pipeline";
import { PublishPackageExportButton } from "../publish/package-export-button";
import { TypesetConfigModal } from "../publish/typeset-config-modal";
import styles from "./typeset-detail-content.module.css";

function chapterStatusLabel(status: string) {
  if (status === "COMMITTED") return { label: "Committed", color: "#4a7c59", symbol: "✓" };
  if (status === "REVIEW_READY") return { label: "Awaiting approval", color: "#B8793A", symbol: "◐" };
  return { label: "Draft", color: "#9a8a7a", symbol: "○" };
}

function ValidationLevelIcon({ level }: { level: string }) {
  if (level === "error") return <span style={{ color: "#c0392b", fontWeight: 700, marginRight: 6 }}>✕</span>;
  if (level === "warning") return <span style={{ color: "#B8793A", fontWeight: 700, marginRight: 6 }}>!</span>;
  return <span style={{ color: "#8a9a8a", fontWeight: 700, marginRight: 6 }}>i</span>;
}

export async function TypesetDetailContent({ slug }: { slug: string }) {
  const data = await getPublishPipelineData(slug);

  const errors = data.validation.filter((v) => v.level === "error");
  const warnings = data.validation.filter((v) => v.level === "warning");
  const notices = data.validation.filter((v) => v.level === "notice");

  const overallStatus =
    errors.length > 0 ? "blocked" : warnings.length > 0 ? "warnings" : "ready";

  const statusConfig = {
    blocked: { label: "Blocked", color: "#c0392b", bg: "rgba(192,57,43,0.06)" },
    warnings: { label: "Ready with warnings", color: "#B8793A", bg: "rgba(184,121,58,0.06)" },
    ready: { label: "Ready to export", color: "#4a7c59", bg: "rgba(74,124,89,0.06)" },
  }[overallStatus];

  return (
    <div className={styles.productionRoom} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto" }}>
      <section className={`glass-panel topbar ${styles.productionHero}`}>
        <div>
          <div className={styles.eyebrow}>The Production Room · Deterministic Assembly</div>
          <h2>Typeset &amp; Publish</h2>
          <div className="muted">
            Assembles committed chapter artifacts into structured export packages.
            No prose is generated, edited, or rewritten. This pipeline reads what
            was committed and packages it exactly as approved.
          </div>
        </div>

        <div className={`button-row ${styles.exportActions}`}>
          {data.canExport ? <>
            <a href={`/api/books/${slug}/workspace-export?format=docx`} download className="btn">↓ Word Document</a>
            <a href={`/api/books/${slug}/workspace-export?format=manuscript`} download className="btn">↓ Markdown</a>
          </> : <>
            <span className="btn" aria-disabled="true" title="Approve Citation Audit and lock the bibliography first">Word Document locked</span>
            <a href={`/api/books/${slug}/workspace-export?format=manuscript&mode=proof`} download className="btn">↓ Marked proof</a>
          </>}
          <TypesetConfigModal
            slug={slug}
            trimSize={data.book.trimSize}
            targetPageCount={data.book.targetPageCount}
            outputFormats={data.book.outputFormats}
          />
          <PublishPackageExportButton slug={slug} title={data.book.title ?? "manuscript"} disabled={!data.canExport} />
        </div>
      </section>

      <div className={styles.preflightStrip} data-status={overallStatus}>
        <div><span>Preflight status</span><strong>{statusConfig.label}</strong></div>
        <div><span>Committed chapters</span><strong>{data.summary.committedChapters}/{data.summary.totalChapters}</strong></div>
        <div><span>Production words</span><strong>{data.summary.committedWords.toLocaleString()}</strong></div>
        <div><span>Open issues</span><strong>{errors.length + warnings.length}</strong></div>
      </div>

      <section className={`glass-panel section-panel ${styles.productionPanel}`} style={{ marginTop: 18 }}>
        <div className="section-header">
          <div>
            <h3>Validation Report</h3>
            <div className="muted">
              Issues that must be resolved before or after export. Errors block package
              generation. Warnings allow export but should be reviewed before publishing.
            </div>
          </div>
          <div
            style={{
              padding: "4px 12px",
              borderRadius: 6,
              background: statusConfig.bg,
              border: `1px solid ${statusConfig.color}40`,
              fontSize: 12,
              fontWeight: 600,
              color: statusConfig.color,
              whiteSpace: "nowrap",
            }}
          >
            {statusConfig.label}
          </div>
        </div>

        {data.validation.length === 0 ? (
          <div className="muted">No issues found.</div>
        ) : (
          <div className="stack" style={{ padding: 0 }}>
            {errors.length > 0 && (
              <div className="card" style={{ borderLeft: "3px solid #c0392b" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#c0392b", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                  Errors — blocks export ({errors.length})
                </div>
                {errors.map((v) => (
                  <div key={v.code} style={{ display: "flex", alignItems: "flex-start", marginBottom: 8, fontSize: 13 }}>
                    <ValidationLevelIcon level={v.level} />
                    <div>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#9a8a7a", marginRight: 8 }}>{v.code}</span>
                      {v.message}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="card" style={{ borderLeft: "3px solid #B8793A" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#B8793A", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                  Warnings — review before publishing ({warnings.length})
                </div>
                {warnings.map((v) => (
                  <div key={v.code} style={{ display: "flex", alignItems: "flex-start", marginBottom: 8, fontSize: 13 }}>
                    <ValidationLevelIcon level={v.level} />
                    <div>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#9a8a7a", marginRight: 8 }}>{v.code}</span>
                      {v.message}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {notices.length > 0 && (
              <div className="card" style={{ borderLeft: "3px solid #8a9a8a" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6f6256", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>
                  Notices ({notices.length})
                </div>
                {notices.map((v) => (
                  <div key={v.code} style={{ display: "flex", alignItems: "flex-start", marginBottom: 8, fontSize: 13 }}>
                    <ValidationLevelIcon level={v.level} />
                    <div>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#9a8a7a", marginRight: 8 }}>{v.code}</span>
                      {v.message}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className={`glass-panel section-panel ${styles.productionPanel}`} style={{ marginTop: 18 }}>
        <div className="section-header">
          <div>
            <h3>Chapter Readiness</h3>
            <div className="muted">Only committed chapters are included in export packages.</div>
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color:
                data.summary.committedChapters === data.summary.totalChapters && data.summary.totalChapters > 0
                  ? "#4a7c59"
                  : "#B8793A",
            }}
          >
            {data.summary.committedChapters}/{data.summary.totalChapters} committed
            {data.summary.committedWords > 0 && (
              <span style={{ fontWeight: 400, color: "#8a7a6a", marginLeft: 10 }}>
                {data.summary.committedWords.toLocaleString()} words
              </span>
            )}
          </div>
        </div>

        {data.chapters.length === 0 ? (
          <div className="empty-state">No chapter drafts found. Complete the Chapter Draft stage first.</div>
        ) : (
          <table className={styles.readinessTable} style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(45,36,29,0.1)" }}>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0", fontWeight: 600, color: "#6f6256", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>#</th>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0", fontWeight: 600, color: "#6f6256", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>Chapter</th>
                <th style={{ textAlign: "right", padding: "6px 12px 6px 0", fontWeight: 600, color: "#6f6256", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>Words</th>
                <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 600, color: "#6f6256", fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.chapters.map((ch, i) => {
                const st = chapterStatusLabel(ch.artifactStatus);
                return (
                  <tr key={ch.id} style={{ borderBottom: "1px solid rgba(45,36,29,0.06)" }}>
                    <td style={{ padding: "8px 12px 8px 0", color: "#9a8a7a", fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                    <td style={{ padding: "8px 12px 8px 0", color: "#2d241d" }}>{ch.title}</td>
                    <td style={{ padding: "8px 12px 8px 0", textAlign: "right", color: "#6f6256", fontVariantNumeric: "tabular-nums" }}>
                      {ch.wordCount > 0 ? ch.wordCount.toLocaleString() : "—"}
                    </td>
                    <td style={{ padding: "8px 0", textAlign: "right" }}>
                      <span style={{ color: st.color, fontWeight: 600, fontSize: 12 }}>
                        {st.symbol} {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {data.chapters.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "1px solid rgba(45,36,29,0.15)" }}>
                  <td colSpan={2} style={{ padding: "8px 12px 8px 0", fontWeight: 600, color: "#6f6256", fontSize: 12 }}>Total</td>
                  <td style={{ padding: "8px 12px 8px 0", textAlign: "right", fontWeight: 600, color: "#6f6256", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                    {data.summary.totalWords.toLocaleString()}
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600, color: "#6f6256", fontSize: 12 }}>
                    {data.summary.committedChapters}/{data.summary.totalChapters}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </section>

      <section className={`workspace-grid ${styles.packageGrid}`} style={{ marginTop: 18, gridTemplateColumns: "1fr" }}>
        <section className="glass-panel section-panel">
          <div className="section-header">
            <h3>Publish Package</h3>
          </div>
          <div className="muted" style={{ marginBottom: 14, lineHeight: 1.7 }}>
            Full publishing handoff bundle with all export formats and distribution files.
          </div>
          <div className="card">
            <strong>Included files</strong>
            <ul className="clean-list" style={{ marginTop: 10 }}>
              <li><code>.docx</code> — Word document</li>
              <li><code>.html</code> — web-ready HTML</li>
              <li><code>.md</code> — clean Markdown</li>
              <li><code>.json</code> — structured manuscript data</li>
              <li><code>-interior.html</code> + <code>-print.css</code> — typeset files</li>
              <li><code>layout-manifest.json</code>, <code>cover-brief.json</code></li>
              <li><code>distribution-manifest.json</code> — downstream publishing steps</li>
              <li><code>preflight-report.json</code> — validation checks</li>
              <li><code>publish-package.json</code> — package manifest</li>
            </ul>
          </div>
          <div className="card" style={{ marginTop: 10 }}>
            <strong>Provenance guarantee</strong>
            <ul className="clean-list" style={{ marginTop: 10 }}>
              <li>Every package records exactly which committed artifacts were used</li>
              <li>Source artifacts are never modified by the export</li>
              <li>Package timestamp shows when the export was generated</li>
            </ul>
          </div>
        </section>
      </section>

      <section className="glass-panel section-panel" style={{ marginTop: 18 }}>
        <div className="section-header">
          <h3>Book Metadata</h3>
          <div className="muted">Used in export package headers and metadata files.</div>
        </div>
        <div className="manuscript-progress-grid">
          <div className="metric-card">
            <div className="label">Title</div>
            <strong>{data.book.title ?? <span style={{ color: "#c0392b" }}>Missing</span>}</strong>
          </div>
          <div className="metric-card">
            <div className="label">Subtitle</div>
            <strong>{data.book.subtitle ?? <span style={{ color: "#9a8a7a" }}>Not set</span>}</strong>
          </div>
          <div className="metric-card">
            <div className="label">Author</div>
            <strong>{data.book.authorName ?? <span style={{ color: "#9a8a7a" }}>Not set</span>}</strong>
          </div>
          <div className="metric-card">
            <div className="label">Word count target</div>
            <strong>
              {data.book.targetWordCount ? `${data.book.targetWordCount.toLocaleString()} words` : <span style={{ color: "#9a8a7a" }}>Not set</span>}
            </strong>
          </div>
          <div className="metric-card">
            <div className="label">Committed words</div>
            <strong>{data.summary.committedWords.toLocaleString()}</strong>
          </div>
          <div className="metric-card">
            <div className="label">Committed chapters</div>
            <strong>{data.summary.committedChapters} of {data.summary.totalChapters}</strong>
          </div>
        </div>
      </section>

      <section className="glass-panel section-panel" style={{ marginTop: 18, marginBottom: 32 }}>
        <div className="section-header">
          <h3>Pipeline Operating Principles</h3>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            ["Deterministic", "Same committed inputs produce the same output every time."],
            ["Non-destructive", "Source artifacts are never modified by an export."],
            ["Traceable", "Every output records exactly which artifact versions were used."],
            ["Validated", "Missing or broken pieces are flagged before export."],
            ["No silent invention", "Missing content is flagged, never fabricated."],
            ["No editorial judgment", "Content quality belongs to Reed. This pipeline packages only."],
          ].map(([title, desc]) => (
            <div key={title} style={{ fontSize: 13, lineHeight: 1.6 }}>
              <strong style={{ color: "#2d241d" }}>{title}</strong>
              <div className="muted">{desc}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
