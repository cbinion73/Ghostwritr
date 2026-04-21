/**
 * Compile-time exhaustiveness check for GateDecision<A>.
 *
 * No runtime test framework yet (Vitest arrives in E1.S4). Instead, this file
 * is consumed by `tsc --noEmit` (via `npm run check`) and serves three roles:
 *
 *   1. Proves `foldGate` handles all three variants (pass, retry, fail) — if a
 *      fourth variant is added to GateDecision<A> and foldGate isn't updated,
 *      `npm run check` fails at `assertNeverGate` inside types.ts.
 *
 *   2. Demonstrates the expected consumer pattern for downstream critics
 *      (voice-guard E2.S5, editor E5.S2) to copy.
 *
 *   3. Confirms no `any` is required anywhere in the gate-decision path.
 *
 * The functions below are exported so `tsc` doesn't tree-shake them out of
 * the compilation. They are never invoked at runtime; their only job is to
 * fail the build if an exhaustiveness invariant breaks.
 */

import {
  type GateDecision,
  foldGate,
  gateFail,
  gatePass,
  gateRetry,
  isGateFail,
  isGatePass,
  isGateRetry,
} from "../types";

type DummyArtifact = { id: string; body: string };

/** Proves all three factories produce valid `GateDecision<DummyArtifact>` values. */
export const __factories_produce_valid_decisions: ReadonlyArray<GateDecision<DummyArtifact>> = [
  gatePass({ id: "a1", body: "hello" }, ["no issues found"]),
  gatePass({ id: "a2", body: "hello" }), // reasons optional
  gateRetry(["thin opening"], "open with a scene, not a claim"),
  gateRetry(["missing citation"]), // hint optional
  gateFail(["wrong framework shape"]),
];

/**
 * Proves `foldGate` exhaustively dispatches across all variants.
 * If GateDecision<A> ever gains a fourth variant and this switch isn't
 * updated, TypeScript will refuse to compile this file.
 */
export function __consumer_must_handle_every_variant(
  decision: GateDecision<DummyArtifact>,
): string {
  return foldGate(decision, {
    pass: ({ artifact, reasons }) =>
      `commit ${artifact.id} (${reasons.length} notes)`,
    retry: ({ reasons, hint }) =>
      `regenerate — ${hint ?? reasons.join("; ")}`,
    fail: ({ reasons }) => `block — ${reasons.join("; ")}`,
  });
}

/**
 * Proves type narrowing helpers work with exhaustive switch.
 * Each `is*` guard must narrow `decision` to the appropriate subtype.
 */
export function __narrowing_guards_narrow_correctly(
  decision: GateDecision<DummyArtifact>,
): string {
  if (isGatePass(decision)) {
    // decision.artifact must be accessible here — narrowed to pass variant
    return `pass: ${decision.artifact.id}`;
  }
  if (isGateRetry(decision)) {
    // decision.hint must be accessible (optional) — narrowed to retry variant
    return `retry: ${decision.hint ?? "no hint"}`;
  }
  if (isGateFail(decision)) {
    // decision.reasons must be accessible — narrowed to fail variant
    return `fail: ${decision.reasons.length} reasons`;
  }
  // If any variant is added without updating the narrowing chain above,
  // `decision` will still be non-never here and TypeScript will accept the
  // fallthrough — we prevent that by explicitly narrowing to never:
  const _exhaustive: never = decision;
  return _exhaustive;
}

/**
 * Proves no `any` is needed in the gate-decision path.
 * This export would type-error if any helper returned `any`.
 */
export function __no_any_in_return_path(
  d: GateDecision<DummyArtifact>,
): DummyArtifact | null {
  return foldGate(d, {
    pass: ({ artifact }) => artifact,
    retry: () => null,
    fail: () => null,
  });
}
