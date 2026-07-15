"use client";

import { useCallback, useEffect, useState } from "react";

type Workspace = {
  citationStyle: string;
  chapters: Array<{ chapterKey: string; state: { status: string; auditFingerprint: string } | null }>;
  selectedChapterKey: string | null;
  state: { status: string; auditFingerprint: string } | null;
  findings: Array<{ id: string; kind: string; claimText: string; supportingExcerpt?: string | null; notes?: string | null; findingFingerprint: string }>;
  reviews: Array<{ findingFingerprint: string; decision: string; reason?: string | null }>;
  finalChapter: { chapterLabel: string; finalText: string; approvedFinalVersionId: string } | null;
  auditRun: { status: string; errorText?: string | null } | null;
};

export function CitationAuditContent({ slug }: { slug: string }) {
  const [data, setData] = useState<Workspace | null>(null); const [chapter, setChapter] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async (selected?: string) => { const response = await fetch(`/api/books/${slug}/citation-audit${selected ? `?chapter=${encodeURIComponent(selected)}` : ""}`); const value = await response.json(); if (!response.ok) throw new Error(value.error ?? "Could not load Citation Audit."); setData(value); setChapter(value.selectedChapterKey ?? ""); }, [slug]);
  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);
  useEffect(() => { if (!data?.auditRun || !["QUEUED", "RUNNING"].includes(data.auditRun.status)) return; const timer = window.setInterval(() => { void load(chapter); }, 2500); return () => window.clearInterval(timer); }, [chapter, data?.auditRun, load]);
  async function post(payload: Record<string, unknown>) { setBusy(true); setMessage(""); try { const response = await fetch(`/api/books/${slug}/citation-audit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const value = await response.json(); if (!response.ok) throw new Error(value.error ?? "Citation Audit action failed."); setMessage(payload.action === "RUN" ? "Citation Audit queued." : "Decision saved."); await load(chapter); } catch (error) { setMessage(error instanceof Error ? error.message : "Citation Audit action failed."); } finally { setBusy(false); } }
  const latest = new Map<string, Workspace["reviews"][number]>();
  // The API returns newest first; do not let an older append-only decision
  // overwrite the current decision for the same exact finding.
  for (const review of data?.reviews ?? []) if (!latest.has(review.findingFingerprint)) latest.set(review.findingFingerprint, review);
  return <main style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 24px", color: "#2d241d" }}>
    <h1>Final Citation Audit</h1>
    <p>Review the exact approved final prose one chapter at a time. Only current Gate 1 evidence can support publication.</p>
    <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
      <select value={data?.citationStyle ?? "CHICAGO_17"} onChange={(event) => void post({ action: "SET_STYLE", citationStyle: event.target.value })} disabled={busy}><option value="CHICAGO_17">Chicago 17</option><option value="APA_7">APA 7</option><option value="MLA_9">MLA 9</option></select>
      <select value={chapter} onChange={(event) => { setChapter(event.target.value); void load(event.target.value); }} disabled={busy}>{data?.chapters.map((item) => <option key={item.chapterKey} value={item.chapterKey}>{item.chapterKey} · {item.state?.status ?? "NOT AUDITED"}</option>)}</select>
      <button disabled={busy || !chapter} onClick={() => void post({ action: "RUN", chapterKey: chapter })}>Run audit</button>
      <button disabled={busy || !data?.state} onClick={() => void post({ action: "APPROVE_CHAPTER", chapterKey: chapter, expectedAuditFingerprint: data?.state?.auditFingerprint })}>Approve chapter audit</button>
      <button disabled={busy || !data?.state} onClick={() => void post({ action: "REOPEN_CHAPTER", chapterKey: chapter, expectedAuditFingerprint: data?.state?.auditFingerprint })}>Reopen chapter audit</button>
      <button disabled={busy || !data?.chapters.every((item) => item.state?.status === "APPROVED")} onClick={() => void post({ action: "LOCK_LEDGER" })}>Lock bibliography ledger</button>
    </div>
    {data?.auditRun ? <p style={{ fontSize: 12 }}>Audit job: {data.auditRun.status}{data.auditRun.errorText ? ` · ${data.auditRun.errorText}` : ""}</p> : null}
    {data?.finalChapter ? <section style={{ border: "1px solid #d7c7b2", borderRadius: 10, padding: 16, background: "#fffdf8", whiteSpace: "pre-wrap", maxHeight: 340, overflow: "auto" }}><strong>{data.finalChapter.chapterLabel}</strong><div style={{ fontSize: 11, color: "#806b59", margin: "4px 0 12px" }}>Exact approved version {data.finalChapter.approvedFinalVersionId}</div>{data.finalChapter.finalText}</section> : null}
    <div style={{ display: "grid", gap: 10, marginTop: 18 }}>{data?.findings.map((finding) => { const review = latest.get(finding.findingFingerprint); return <article key={finding.id} style={{ border: `1px solid ${finding.kind === "SUPPORTED" ? "#8cb9a5" : "#c98b7f"}`, borderRadius: 10, padding: 14 }}>
      <strong>{finding.kind.replaceAll("_", " ")}</strong>{review ? <span style={{ marginLeft: 8, fontSize: 12 }}>· {review.decision}</span> : null}
      <blockquote style={{ borderLeft: "3px solid #9a7b5c", paddingLeft: 10 }}>{finding.claimText}</blockquote>
      {finding.supportingExcerpt ? <div style={{ fontSize: 12, background: "#eff7f2", padding: 8 }}>Evidence: {finding.supportingExcerpt}</div> : null}
      {finding.notes ? <p style={{ fontSize: 12 }}>{finding.notes}</p> : null}
      {finding.kind !== "SUPPORTED" ? <div style={{ display: "flex", gap: 8 }}><button disabled={busy} onClick={() => { const reason = window.prompt("Document why this exact finding is acceptable:"); if (reason) void post({ action: "REVIEW", chapterKey: chapter, findingId: finding.id, decision: "MANUAL_EXCEPTION", reason, expectedAuditFingerprint: data.state?.auditFingerprint }); }}>Document exception</button><button disabled={busy} onClick={() => void post({ action: "REVIEW", chapterKey: chapter, findingId: finding.id, decision: "REQUEST_REVISION", expectedAuditFingerprint: data.state?.auditFingerprint })}>Request final revision</button></div> : null}
    </article>; })}</div>
    {message ? <p role="status">{message}</p> : null}
  </main>;
}
