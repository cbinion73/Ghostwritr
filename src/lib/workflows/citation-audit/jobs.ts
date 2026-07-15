import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CitationStyle, Prisma, StageKey, WorkflowRunStatus } from "@prisma/client";
import { z } from "zod";

import { LLMGatewayError } from "../../llm/gateway";
import { acquireLLMCallForRole } from "../../llm/routing";
import {
  claimWorkflowRun,
  completeWorkflowRun,
  createWorkflowRun,
  failWorkflowRun,
  getWorkflowRunById,
  releaseWorkflowRunForBudgetConfirmation,
  resetWorkflowRunForExplicitRerun,
  startWorkflowRunHeartbeat,
} from "../../repositories/workflow-runs";
import {
  loadCurrentAdmittedEvidence,
  loadExactApprovedFinalChapter,
  persistCitationAudit,
} from "../../repositories/citation-audit";
import { auditFinalChapter, type CitationAuditDependencies } from "./engine";
import { buildAuditFingerprint, buildSourceLedgerFingerprint, CITATION_AUDIT_POLICY_VERSION } from "./contracts";
import { db } from "../../db";
import { fetchWebPage, WebAccessError } from "../../web-access";

const ClaimSchema = z.object({
  claimText: z.string(),
  claimStart: z.number().int().nonnegative(),
  claimEnd: z.number().int().positive(),
  evidenceKey: z.string().nullable(),
  assessment: z.enum(["SUPPORTED", "MISSING_SOURCE", "INACCESSIBLE", "CONTRADICTED", "DISTORTED", "UNSUPPORTED"]),
  supportingExcerpt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
const AuditOutputSchema = z.object({ claims: z.array(ClaimSchema) });

type AuditJobInput = { kind: "final_citation_audit"; chapterKey: string; approvedFinalVersionId: string; auditFingerprint: string; citationStyle: CitationStyle };

function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export function citationAuditRunDisposition(status: WorkflowRunStatus, attempt: number, maxAttempts: number, forceRerun = false) {
  if (forceRerun && new Set<WorkflowRunStatus>([WorkflowRunStatus.SUCCEEDED, WorkflowRunStatus.FAILED, WorkflowRunStatus.CANCELED]).has(status)) return "RESET" as const;
  if (status === WorkflowRunStatus.FAILED && attempt < maxAttempts) return "REQUEUE" as const;
  return "UNCHANGED" as const;
}

export async function enqueueCitationAudit(input: { bookId: string; chapterKey: string; forceRerun?: boolean }) {
  const [chapter, evidence, book] = await Promise.all([
    loadExactApprovedFinalChapter(input.bookId, input.chapterKey),
    loadCurrentAdmittedEvidence(input.bookId, input.chapterKey),
    db.book.findUniqueOrThrow({ where: { id: input.bookId }, select: { citationStyle: true } }),
  ]);
  const auditFingerprint = buildAuditFingerprint({ approvedFinalVersionId: chapter.approvedFinalVersionId, finalText: chapter.finalText, sourceLedgerFingerprint: buildSourceLedgerFingerprint(evidence), citationStyle: book.citationStyle });
  const payload: AuditJobInput = { kind: "final_citation_audit", chapterKey: input.chapterKey, approvedFinalVersionId: chapter.approvedFinalVersionId, auditFingerprint, citationStyle: book.citationStyle };
  const run = await createWorkflowRun({ bookId: input.bookId, stageKey: StageKey.CITATION_AUDIT, idempotencyKey: `citation-audit:${input.chapterKey}:${auditFingerprint}`, maxAttempts: 3, inputJson: payload as unknown as Prisma.InputJsonValue });
  const disposition = citationAuditRunDisposition(run.status, run.attempt, run.maxAttempts, input.forceRerun);
  if (disposition === "RESET") return resetWorkflowRunForExplicitRerun(run.id, payload as unknown as Prisma.InputJsonValue);
  if (disposition === "REQUEUE") return db.workflowRun.update({ where: { id: run.id }, data: { status: WorkflowRunStatus.QUEUED, errorText: null, finishedAt: null } });
  return run;
}

async function liveDependencies(input: { bookId: string; runId: string; chapterKey: string }): Promise<CitationAuditDependencies> {
  const call = await acquireLLMCallForRole("source-verification:adversarial", { maxRetries: 1, maxOutputTokens: 4000, timeoutMs: 60_000 }, { bookId: input.bookId, workflowRunId: input.runId, chapterKey: input.chapterKey, stageKey: StageKey.CITATION_AUDIT, operation: "final-citation-audit" });
  if (!call) throw new Error("No independent citation-audit model is configured.");
  const model = call.model.withStructuredOutput(AuditOutputSchema, { includeRaw: true });
  const linkCache = new Map<string, "FOUND" | "NOT_FOUND" | "INACCESSIBLE">();
  return {
    extractClaims: async ({ finalText, evidence }) => {
      const startedAt = Date.now();
      try {
        const response = await model.invoke([
          new SystemMessage("Audit every externally verifiable factual, quantitative, quotation, attribution, causal, and case-study claim in the exact final prose. Return literal character offsets into finalText. Use only supplied Gate 1 evidence keys. Never infer support or propose replacements."),
          new HumanMessage(JSON.stringify({ finalText, admittedEvidence: evidence })),
        ]);
        const raw = response.raw as { usage_metadata?: { input_tokens?: number; output_tokens?: number } };
        await call.recordUsage({ promptTokens: raw.usage_metadata?.input_tokens ?? 0, completionTokens: raw.usage_metadata?.output_tokens ?? 0, durationMs: Date.now() - startedAt });
        return response.parsed.claims;
      } catch (error) {
        await call.recordFailure({ error, durationMs: Date.now() - startedAt });
        throw error;
      }
    },
    checkLink: async (url) => {
      const cached = linkCache.get(url); if (cached) return cached;
      try { await fetchWebPage(url, { purpose: "Final Citation Audit link check", minTextLength: 80 }); linkCache.set(url, "FOUND"); return "FOUND"; }
      catch (error) { const state = error instanceof WebAccessError && /404|410/.test(error.message) ? "NOT_FOUND" as const : "INACCESSIBLE" as const; linkCache.set(url, state); return state; }
    },
  };
}

export async function processCitationAuditWorkflowRun(runId: string, dependencies?: CitationAuditDependencies) {
  const run = await getWorkflowRunById(runId);
  if (!run) throw new Error(`Workflow run ${runId} was not found.`);
  const raw = record(run.inputJson);
  if (raw.kind !== "final_citation_audit" || typeof raw.chapterKey !== "string" || typeof raw.auditFingerprint !== "string") throw new Error("Workflow run is not a final Citation Audit job.");
  if (run.status === WorkflowRunStatus.SUCCEEDED) return { skipped: true, cached: true };
  const claimed = await claimWorkflowRun(runId); if (!claimed.count) return { skipped: true };
  const stopHeartbeat = startWorkflowRunHeartbeat(runId, claimed.leaseOwner, claimed.leaseMs);
  try {
    const chapter = await loadExactApprovedFinalChapter(run.bookId, raw.chapterKey);
    const evidence = await loadCurrentAdmittedEvidence(run.bookId, raw.chapterKey);
    const book = await db.book.findUniqueOrThrow({ where: { id: run.bookId }, select: { citationStyle: true } });
    const currentFingerprint = buildAuditFingerprint({ approvedFinalVersionId: chapter.approvedFinalVersionId, finalText: chapter.finalText, sourceLedgerFingerprint: buildSourceLedgerFingerprint(evidence), citationStyle: book.citationStyle });
    if (currentFingerprint !== raw.auditFingerprint) throw new Error("Citation Audit input became stale before execution.");
    const result = await auditFinalChapter({ finalText: chapter.finalText, evidence, policyVersion: CITATION_AUDIT_POLICY_VERSION, checkChangedLinks: dependencies ? false : true }, dependencies ?? await liveDependencies({ bookId: run.bookId, runId, chapterKey: raw.chapterKey }));
    await persistCitationAudit({ bookId: run.bookId, chapterKey: raw.chapterKey, approvedFinalVersionId: chapter.approvedFinalVersionId, citationStyle: book.citationStyle, finalText: chapter.finalText, evidence, findings: result.findings, workflowRunId: runId });
    const output = { kind: "final_citation_audit", chapterKey: raw.chapterKey, findingCount: result.findings.length, usedEvidenceKeys: result.usedEvidenceKeys, unusedEvidenceKeys: result.unusedEvidenceKeys, auditFingerprint: currentFingerprint };
    await completeWorkflowRun(runId, output as unknown as Prisma.InputJsonValue);
    return output;
  } catch (error) {
    if (error instanceof LLMGatewayError && error.code === "budget_confirmation_required") {
      await releaseWorkflowRunForBudgetConfirmation(runId, error.message);
      return { paused: true, code: error.code };
    }
    await failWorkflowRun(runId, error instanceof Error ? error.message : "Citation Audit failed.");
    throw error;
  } finally { stopHeartbeat(); }
}

export function isCitationAuditRun(inputJson: unknown) { return record(inputJson).kind === "final_citation_audit"; }

export function citationAuditFailureDisposition(error: unknown) {
  return error instanceof LLMGatewayError && error.code === "budget_confirmation_required"
    ? "PAUSE_FOR_BUDGET" as const
    : "FAIL" as const;
}
