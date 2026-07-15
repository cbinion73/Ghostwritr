"use client";

import { useCallback, useEffect, useState } from "react";

type ReviewRecord = {
  kind: "RESEARCH_CLAIM" | "EXTERNAL_STORY";
  recordId: string;
  artifactVersionId: string;
  text: string;
  source: { title: string; url: string; author?: string | null; publisher?: string | null } | null;
  verification: null | {
    fingerprint: string;
    verdict: string;
    supportingExcerpt?: string | null;
    contradictingExcerpt?: string | null;
    reasonCodes: unknown;
    corrections: unknown;
    notes?: string | null;
  };
  review: null | { decision: string; notes?: string | null; fingerprint: string };
};

type GateData = {
  chapterKeys: string[];
  chapterKey: string | null;
  records: ReviewRecord[];
  verificationRun?: { status: string; errorText?: string | null; outputJson?: unknown } | null;
  chapterReadiness: Array<{ chapterKey: string; total: number; admitted: number; blocked: number; ready: boolean }>;
  allChaptersReady: boolean;
};

export function SourceReviewGate({
  slug,
  onChanged,
  onReadinessChange,
}: {
  slug: string;
  onChanged?: () => void;
  onReadinessChange?: (ready: boolean) => void;
}) {
  const [data, setData] = useState<GateData | null>(null);
  const [chapter, setChapter] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async (selected?: string) => {
    const response = await fetch(`/api/books/${slug}/source-review${selected ? `?chapter=${encodeURIComponent(selected)}` : ""}`);
    if (!response.ok) throw new Error("Could not load source review.");
    const next = await response.json() as GateData;
    setData(next);
    setChapter(next.chapterKey ?? "");
    onReadinessChange?.(next.allChaptersReady);
  }, [onReadinessChange, slug]);

  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);
  useEffect(() => {
    if (data?.verificationRun?.status !== "QUEUED" && data?.verificationRun?.status !== "RUNNING") return;
    const timer = window.setInterval(() => { void load(chapter); }, 2500);
    return () => window.clearInterval(timer);
  }, [chapter, data?.verificationRun?.status, load]);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/books/${slug}/source-review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Source review failed.");
      setMessage(payload.action === "VERIFY" ? "Independent verification queued." : "Decision saved.");
      await load(chapter);
      onChanged?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Source review failed.");
    } finally {
      setBusy(false);
    }
  }

  const decided = data?.records.filter((record) => record.review && record.review.fingerprint === record.verification?.fingerprint).length ?? 0;
  const admitted = data?.chapterReadiness.find((entry) => entry.chapterKey === chapter)?.admitted ?? 0;
  const blocked = data?.chapterReadiness.find((entry) => entry.chapterKey === chapter)?.blocked ?? 0;
  return (
    <section style={{ padding: "14px 18px", borderBottom: "1px solid #ddd1bf", background: "#fffaf0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <strong>Gate 1 · Verify and admit sources</strong>
          <div style={{ fontSize: 12, color: "#6f5b4d" }}>Review one chapter at a time. Quill receives only the exact versions you admit here.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={chapter} onChange={(event) => { setChapter(event.target.value); void load(event.target.value); }} disabled={busy}>
            {(data?.chapterKeys ?? []).map((key) => <option key={key} value={key}>{key}</option>)}
          </select>
          <button disabled={busy || !chapter} onClick={() => void post({ action: "VERIFY", chapterKey: chapter })}>Run independent verification</button>
        </div>
      </div>
      {data?.records.length ? <div style={{ marginTop: 8, fontSize: 12 }}>
        {decided}/{data.records.length} decided · {admitted} admitted · {blocked} blocked · all chapters {data.allChaptersReady ? "ready" : "not ready"}
      </div> : null}
      {data?.verificationRun ? <div style={{ marginTop: 5, fontSize: 12, color: data.verificationRun.status === "FAILED" ? "#9b2d20" : "#6f5b4d" }}>
        Verification job: {data.verificationRun.status}{data.verificationRun.errorText ? ` · ${data.verificationRun.errorText}` : ""}
      </div> : null}
      <div style={{ display: "grid", gap: 8, marginTop: 10, maxHeight: 320, overflowY: "auto" }}>
        {(data?.records ?? []).map((record) => (
          <article key={`${record.kind}:${record.recordId}`} style={{ border: "1px solid #ddcfbb", borderRadius: 8, padding: 10, background: "white" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#715b49" }}>{record.kind.replaceAll("_", " ")} · {record.verification?.verdict ?? "NOT VERIFIED"} · {record.review?.decision ?? "UNREVIEWED"}</div>
            <div style={{ marginTop: 4, fontSize: 13 }}>{record.text}</div>
            <div style={{ marginTop: 3, fontSize: 10, color: "#8a7565" }}>Reviewed artifact version: {record.artifactVersionId}</div>
            {record.source ? <div style={{ marginTop: 5, fontSize: 12 }}><a href={record.source.url} target="_blank" rel="noreferrer">{record.source.title}</a>{record.source.author ? ` · ${record.source.author}` : ""}</div> : null}
            {record.verification?.supportingExcerpt ? <blockquote style={{ margin: "7px 0", paddingLeft: 8, borderLeft: "3px solid #2f7d65", fontSize: 12 }}>{record.verification.supportingExcerpt}</blockquote> : null}
            {record.verification?.contradictingExcerpt ? <blockquote style={{ margin: "7px 0", paddingLeft: 8, borderLeft: "3px solid #b74737", color: "#7f261b", fontSize: 12 }}>{record.verification.contradictingExcerpt}</blockquote> : null}
            {record.verification ? <div style={{ margin: "5px 0", fontSize: 11, color: "#6f5b4d" }}>
              {record.verification.notes ? <div>{record.verification.notes}</div> : null}
              <div>Reasons: {JSON.stringify(record.verification.reasonCodes)}</div>
              {Array.isArray(record.verification.corrections) && record.verification.corrections.length > 0
                ? <div>Corrections: {JSON.stringify(record.verification.corrections)}</div>
                : null}
            </div> : null}
            {record.verification ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {record.verification.verdict === "VERIFIED" ? <button disabled={busy} onClick={() => void post({ action: "DECIDE", decision: "APPROVE", chapterKey: chapter, kind: record.kind, recordId: record.recordId, artifactVersionId: record.artifactVersionId, verificationFingerprint: record.verification?.fingerprint })}>Approve</button> : null}
              {record.verification.verdict === "VERIFIED_WITH_CORRECTION" ? <button disabled={busy} onClick={() => void post({ action: "DECIDE", decision: "APPROVE_CORRECTED", chapterKey: chapter, kind: record.kind, recordId: record.recordId, artifactVersionId: record.artifactVersionId, verificationFingerprint: record.verification?.fingerprint })}>Approve correction</button> : null}
              <button disabled={busy} onClick={() => void post({ action: "DECIDE", decision: "REQUEST_CORROBORATION", chapterKey: chapter, kind: record.kind, recordId: record.recordId, artifactVersionId: record.artifactVersionId, verificationFingerprint: record.verification?.fingerprint })}>Request corroboration</button>
              <button disabled={busy} onClick={() => void post({ action: "DECIDE", decision: "REJECT", chapterKey: chapter, kind: record.kind, recordId: record.recordId, artifactVersionId: record.artifactVersionId, verificationFingerprint: record.verification?.fingerprint })}>Reject</button>
              <button disabled={busy} onClick={() => { const notes = window.prompt("Document why this source is safe to use despite the verifier verdict:"); if (notes) void post({ action: "DECIDE", decision: "MANUAL_EXCEPTION", notes, chapterKey: chapter, kind: record.kind, recordId: record.recordId, artifactVersionId: record.artifactVersionId, verificationFingerprint: record.verification?.fingerprint }); }}>Document exception</button>
              <button disabled={busy} onClick={() => void post({ action: "DECIDE", decision: "REOPEN", chapterKey: chapter, kind: record.kind, recordId: record.recordId, artifactVersionId: record.artifactVersionId, verificationFingerprint: record.verification?.fingerprint })}>Reopen</button>
            </div> : null}
          </article>
        ))}
      </div>
      {message ? <div role="status" style={{ marginTop: 8, fontSize: 12 }}>{message}</div> : null}
    </section>
  );
}
