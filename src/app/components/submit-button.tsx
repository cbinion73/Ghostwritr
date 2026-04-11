"use client";

import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  label: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
};

export function SubmitButton({
  label,
  pendingLabel,
  className = "btn",
  disabled = false,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const text = pending ? pendingLabel ?? `${label}...` : label;

  return (
    <button
      aria-busy={pending}
      className={className}
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? <span className="btn-spinner" aria-hidden="true" /> : null}
      {text}
    </button>
  );
}
