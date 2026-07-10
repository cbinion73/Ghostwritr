"use client";

import { useEffect } from "react";

/**
 * Catches every uncaught error thrown by a Server Action or Server Component
 * render anywhere under /books/[slug] — every stage's actions.ts, all 15 of
 * them, most with zero try/catch of their own. Without this file, any throw
 * (a business-logic error like a readiness gate, or a genuine bug) fell
 * through to Next.js's default global error screen: a blank page with
 * "This page couldn't load," no message, no way back except Reload —
 * confirmed live twice in one session (Commit Editing Stage). This shows
 * the actual error message and a way to retry or go back without losing
 * your place.
 */
export default function BookWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[books/[slug]] uncaught error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: 40,
        textAlign: "center",
      }}
    >
      <div className="glass-panel section-panel" style={{ maxWidth: 560 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
        <h2 style={{ marginTop: 0 }}>Something went wrong</h2>
        <p className="muted" style={{ lineHeight: 1.6, marginBottom: 4 }}>
          {error.message || "An unexpected error occurred."}
        </p>
        {error.digest && (
          <p className="muted" style={{ fontSize: 11, fontFamily: "monospace", marginTop: 4 }}>
            Reference: {error.digest}
          </p>
        )}
        <div className="button-row" style={{ marginTop: 20, justifyContent: "center" }}>
          <button className="btn btn-primary" type="button" onClick={() => reset()}>
            Try Again
          </button>
          <a className="btn" href="/">
            ← Back to Library
          </a>
        </div>
      </div>
    </div>
  );
}
