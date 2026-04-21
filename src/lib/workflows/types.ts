/**
 * Shared workflow types.
 *
 * The central export is `GateDecision<A>` — the typed discriminated union that
 * every critic/gate/verifier in the pipeline should return. It forces an
 * exhaustive switch on the caller side: adding a new variant to the union
 * breaks compilation wherever the variant isn't handled.
 *
 * Per GHOSTWRITR's PRD v1 §6.5 (Observability) and Architecture §3.2
 * (Typed GateDecision — target), gates must answer explicitly: pass, retry,
 * or fail. No "null-or-throw" sentinels. No untyped verdict strings.
 *
 * Usage pattern:
 *
 *   import { GateDecision, foldGate, gatePass, gateRetry, gateFail } from "./types";
 *
 *   function runCritic(draft: Draft): GateDecision<Draft> {
 *     if (draft.looksBad) return gateFail(["wrong framework shape"]);
 *     if (draft.needsTweak) return gateRetry(["tighten the close"], "shorten paragraph 4");
 *     return gatePass(draft, ["clean first pass"]);
 *   }
 *
 *   const nextAction = foldGate(runCritic(draft), {
 *     pass:  ({ artifact }) => `commit ${artifact.id}`,
 *     retry: ({ reasons, hint }) => `regenerate: ${hint ?? reasons.join("; ")}`,
 *     fail:  ({ reasons }) => `block: ${reasons.join("; ")}`,
 *   });
 */

/**
 * A gate verdict over an artifact of type `A`.
 *
 * - `pass`: artifact is good enough to advance; `reasons` optionally explain why.
 * - `retry`: artifact needs regeneration with corrective feedback; `hint` is an
 *   optional targeted instruction to feed back to the drafter.
 * - `fail`: artifact cannot be salvaged from here; `reasons` describe the block.
 */
export type GateDecision<A> =
  | { kind: "pass"; artifact: A; reasons: string[] }
  | { kind: "retry"; reasons: string[]; hint?: string }
  | { kind: "fail"; reasons: string[] };

/** Type alias for a gate decision with no artifact payload (rare — used when
 *  the upstream didn't produce anything inspectable). */
export type VoidGateDecision = GateDecision<null>;

/**
 * Factory: pass verdict with the artifact and optional rationale.
 */
export function gatePass<A>(
  artifact: A,
  reasons: string[] = [],
): GateDecision<A> {
  return { kind: "pass", artifact, reasons };
}

/**
 * Factory: retry verdict with reasons and an optional single-line hint that
 * Quill (or whoever re-drafts) can splice directly into the next prompt.
 */
export function gateRetry<A>(
  reasons: string[],
  hint?: string,
): GateDecision<A> {
  if (reasons.length === 0) {
    // Silent retry is never useful — the drafter needs something to correct against.
    throw new Error("gateRetry requires at least one reason");
  }
  return hint !== undefined
    ? { kind: "retry", reasons, hint }
    : { kind: "retry", reasons };
}

/**
 * Factory: fail verdict when the artifact cannot be salvaged from here.
 * Downstream stages should remain LOCKED / BLOCKED until the author intervenes.
 */
export function gateFail<A>(reasons: string[]): GateDecision<A> {
  if (reasons.length === 0) {
    throw new Error("gateFail requires at least one reason");
  }
  return { kind: "fail", reasons };
}

/**
 * Exhaustiveness guard — unreachable at runtime if every `kind` is handled
 * in the switch. If a new variant is added to `GateDecision<A>` and any
 * `foldGate` call forgets to handle it, TypeScript will fail at this callsite
 * because `x` will no longer narrow to `never`.
 */
function assertNeverGate(x: never): never {
  throw new Error(
    `Unexpected GateDecision kind — exhaustiveness check failed: ${JSON.stringify(x)}`,
  );
}

/** Handlers object for `foldGate`. Must cover every variant; TypeScript will
 *  refuse a missing key at compile time. */
export type GateHandlers<A, T> = {
  pass: (decision: Extract<GateDecision<A>, { kind: "pass" }>) => T;
  retry: (decision: Extract<GateDecision<A>, { kind: "retry" }>) => T;
  fail: (decision: Extract<GateDecision<A>, { kind: "fail" }>) => T;
};

/**
 * Exhaustive consumer. Forces the caller to handle every variant of
 * `GateDecision<A>`. The canonical way to dispatch on a gate verdict.
 *
 * Using `foldGate` instead of an ad-hoc `if/else` chain is how we prevent
 * silent drift when the union grows.
 */
export function foldGate<A, T>(
  decision: GateDecision<A>,
  handlers: GateHandlers<A, T>,
): T {
  switch (decision.kind) {
    case "pass":
      return handlers.pass(decision);
    case "retry":
      return handlers.retry(decision);
    case "fail":
      return handlers.fail(decision);
    default:
      return assertNeverGate(decision);
  }
}

/** Type-narrowing helpers (useful when destructuring isn't an option). */
export function isGatePass<A>(
  d: GateDecision<A>,
): d is Extract<GateDecision<A>, { kind: "pass" }> {
  return d.kind === "pass";
}

export function isGateRetry<A>(
  d: GateDecision<A>,
): d is Extract<GateDecision<A>, { kind: "retry" }> {
  return d.kind === "retry";
}

export function isGateFail<A>(
  d: GateDecision<A>,
): d is Extract<GateDecision<A>, { kind: "fail" }> {
  return d.kind === "fail";
}
