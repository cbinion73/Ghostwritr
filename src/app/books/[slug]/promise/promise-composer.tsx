"use client";

import { useFormStatus } from "react-dom";
import { submitPromiseMessage } from "./actions";

interface PromiseComposerProps {
  slug: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="btn btn-primary"
      type="submit"
      disabled={pending}
      style={{
        opacity: pending ? 0.7 : 1,
        cursor: pending ? "not-allowed" : "pointer",
      }}
    >
      {pending ? (
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "inline-block",
              width: "14px",
              height: "14px",
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.3)",
              borderTop: "2px solid white",
              animation: "spin 0.6s linear infinite",
            }}
          />
          Sending...
        </span>
      ) : (
        "Send"
      )}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}

export function PromiseComposer({
  slug,
  onSubmitted,
}: PromiseComposerProps & { onSubmitted?: () => void }) {
  return (
    <form
      className="composer"
      action={submitPromiseMessage.bind(null, slug)}
      onSubmit={() => onSubmitted?.()}
    >
      <textarea
        name="message"
        placeholder="Enter your rough book idea, refinement, objection, or direction change here."
      />
      <div className="composer-actions">
        <div className="muted">
          Each turn persists to Postgres as versioned Promise-stage artifacts.
        </div>
        <SubmitButton />
      </div>
    </form>
  );
}
