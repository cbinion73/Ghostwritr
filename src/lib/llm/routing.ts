/**
 * Per-stage LLM routing for GHOSTWRITR — cost-optimized for quality at scale.
 *
 * Maps a stage role (e.g. "external-stories:extract") to a ModelSpec string
 * like "anthropic:claude-sonnet-4-6". Env vars override the default per role,
 * so you can A/B test a stage without a code change:
 *
 *   LLM_EXTERNAL_STORIES_EXTRACT=openai:gpt-5
 *   LLM_RESEARCH_EXTRACT=anthropic:claude-opus-4-6
 *
 * Cost Optimization Philosophy:
 *   - Opus (most capable, ~$0.60/1000 tokens): final-editor:polish only (high ROI, touches all chapters)
 *   - Sonnet (fast, cost-effective, ~$0.018/1000 tokens): prose generation (extract, author, enrich)
 *   - Haiku (fastest, ~$0.005/1000 tokens): quality verification, fact-checking, detail review
 *   - GPT-5.4 (web search capable): comprehensive research generation with live web context
 *   - Gemini: long-context grounding + market analysis
 *
 * Expected cost per book (50 chapters):
 *   - Outline (Phase 1, 2, 3): $0.05 (Haiku structural planning)
 *   - External Stories + Research: $12 (batch mode)
 *   - Chapter Drafts: $11 (Sonnet author + revise)
 *   - Final Editor Polish: $11 (Opus)
 *   - Verification + Voice Guard: $4 (GPT-5)
 *   = ~$38/book (vs. ~$85 with all Opus)
 */

import { getModel, type ModelOptions } from "./providers";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type StageRole =
  // External Stories
  | "external-stories:extract"
  | "external-stories:enrich"
  // Research
  | "research:questions"
  | "research:extract"
  | "research:verify"
  | "research:adjudicate"
  | "research:agent-1-researcher"
  | "research:agent-2-extractor"
  | "research:agent-3-verifier"
  // Chapter Draft
  | "chapter-draft:author"
  | "chapter-draft:revise"
  // Voice Guard — MUST be a different family from the author
  | "voice-guard:critic"
  // Setup & Voice Blending
  | "setup:voice-blending"
  // Other stages (wired in later phases)
  | "promise:author"
  | "promise:structured"
  | "audience:author"
  | "audience:structured"
  | "outline:phase-1"
  | "outline:phase-2"
  | "outline:phase-3"
  | "base-story:author"
  | "personal-stories:interview"
  | "fiction:planner"
  | "fiction:draft"
  | "market-analysis:research"
  | "length-adjustment:author"
  | "final-editor:assess"
  | "final-editor:polish"
  | "manifest:generate"
  | "typeset:plan"
  | "launch:listing"
  | "press:kit"
  | "social:campaign"
  | "audio:prep"
  | "course:design"
  | "speaking:kit";

/**
 * Per-role output token overrides.
 *
 * Most stages are fine with the provider default (8,192).
 * Roles that produce long-form prose need more headroom:
 *
 *  - chapter-draft:author  — full chapter prose (up to ~5,000 words) + Quill Package Notes
 *                            easily 5,000–8,000 tokens of output. 16,000 gives safe margin.
 *  - final-editor:polish   — 10-section editorial review across the full manuscript,
 *                            can be 3,000–6,000 tokens. 16,000 gives safe margin.
 *  - fiction:draft         — long prose scenes, same as chapter draft.
 *  - base-story:author     — full narrative essay, needs headroom beyond 8,192.
 */
const ROLE_OUTPUT_TOKENS: Partial<Record<StageRole, number>> = {
  "chapter-draft:author":  16000,
  "chapter-draft:revise":  16000,
  "final-editor:assess":   16000,
  "final-editor:polish":   16000,
  "fiction:draft":         16000,
  "base-story:author":     12000,
  "manifest:generate":     16000,
  "typeset:plan":          16000,
  "launch:listing":        16000,
  "press:kit":             16000,
  "social:campaign":       16000,
  "audio:prep":            16000,
  "course:design":         16000,
  "speaking:kit":          16000,
};

const DEFAULT_ROUTING: Record<StageRole, string> = {
  // --- External Stories: Claude for narrative extraction + enrichment ---
  "external-stories:extract": "anthropic:claude-sonnet-4-6",
  "external-stories:enrich": "anthropic:claude-sonnet-4-6",

  // --- Research: Three-agent pipeline for verified claims ---
  // Legacy research roles (kept for compatibility)
  "research:questions": "openai:gpt-5.4",
  "research:extract": "openai:gpt-5.4",
  "research:verify": "openai:gpt-5.4",
  "research:adjudicate": "openai:gpt-5.4",

  // New three-agent verification pipeline
  "research:agent-1-researcher": "openai:gpt-5.4", // Finds sources, synthesizes, produces claims + citations (with web search)
  "research:agent-2-extractor": "openai:gpt-5.4-mini", // Lightweight: opens URLs, pulls relevant passages
  "research:agent-3-verifier": "anthropic:claude-haiku-4-5-20251001", // Compares claim vs excerpt, outputs verdict

  // --- Chapter Draft: Sonnet for author (cost), Sonnet for revise, Opus for final polish ---
  "chapter-draft:author": "anthropic:claude-sonnet-4-6",
  "chapter-draft:revise": "anthropic:claude-sonnet-4-6",

  // --- Voice Guard: GPT-5 as the different-family critic ---
  "voice-guard:critic": "openai:gpt-5",

  // --- Setup & Voice Blending: Sonnet for cost-effective preview generation + persona suggestions ---
  "setup:voice-blending": "anthropic:claude-sonnet-4-6",

  // --- Other stages (will be wired in later) ---
  "promise:author": "anthropic:claude-sonnet-4-6",
  "promise:structured": "openai:gpt-5",
  "audience:author": "anthropic:claude-sonnet-4-6",
  "audience:structured": "openai:gpt-5",
  "outline:phase-1": "anthropic:claude-sonnet-4-6", // Requires full context + Knowledge Base integration
  "outline:phase-2": "anthropic:claude-sonnet-4-6", // Requires full context + Knowledge Base integration
  "outline:phase-3": "anthropic:claude-sonnet-4-6", // Requires full context + Knowledge Base integration
  "base-story:author": "anthropic:claude-sonnet-4-6",
  "personal-stories:interview": "anthropic:claude-sonnet-4-6",
  "fiction:planner": "anthropic:claude-sonnet-4-6",
  "fiction:draft": "anthropic:claude-sonnet-4-6",
  "market-analysis:research": "google:gemini-2.5-flash",
  "length-adjustment:author": "anthropic:claude-sonnet-4-6",
  "final-editor:assess": "anthropic:claude-sonnet-4-6",  // full manuscript audit — analytical, Sonnet sufficient
  "final-editor:polish": "anthropic:claude-opus-4-6",    // prose revision of specific chapters — Opus quality justified
  "manifest:generate": "anthropic:claude-sonnet-4-6",
  "typeset:plan": "openai:gpt-5.4",  // web search for current KDP/B&N specs
  "launch:listing":   "openai:gpt-5.4",        // web search for current KDP categories/keyword trends
  "press:kit":        "openai:gpt-4o-mini",    // post-production: cost-optimized, no heavy reasoning needed
  "social:campaign":  "openai:gpt-4o-mini",
  "audio:prep":       "openai:gpt-4o-mini",
  "course:design":    "openai:gpt-4o-mini",
  "speaking:kit":     "openai:gpt-4o-mini",
};

function envKeyForRole(role: StageRole): string {
  // "external-stories:extract" -> "LLM_EXTERNAL_STORIES_EXTRACT"
  return (
    "LLM_" +
    role
      .replace(/:/g, "_")
      .replace(/-/g, "_")
      .toUpperCase()
  );
}

export function resolveModelSpec(role: StageRole): string {
  const envKey = envKeyForRole(role);
  const override = process.env[envKey];
  if (override && override.trim().length > 0) {
    return override.trim();
  }
  return DEFAULT_ROUTING[role];
}

/**
 * Get the configured chat model for a stage role. Returns null if the
 * provider's API key is missing (callers should fall back gracefully).
 *
 * Optional fallbackRole: if the primary spec's provider has no key, try
 * this secondary role's spec before returning null. Useful for gracefully
 * downgrading Claude→OpenAI during initial rollout.
 */
export async function getModelForRole(
  role: StageRole,
  options: ModelOptions = {},
  fallbackRole?: StageRole,
): Promise<BaseChatModel | null> {
  // Apply per-role output token ceiling unless caller already specified one
  const roleMaxTokens = ROLE_OUTPUT_TOKENS[role];
  const resolvedOptions: ModelOptions =
    roleMaxTokens && !options.maxOutputTokens
      ? { ...options, maxOutputTokens: roleMaxTokens }
      : options;

  const primary = await getModel(resolveModelSpec(role), resolvedOptions);
  if (primary) return primary;

  if (fallbackRole) {
    const secondary = await getModel(resolveModelSpec(fallbackRole), resolvedOptions);
    if (secondary) return secondary;
  }

  return null;
}
