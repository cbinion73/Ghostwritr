import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIENCE_RESEARCH_PHASE1_SYSTEM_PROMPT,
  AUDIENCE_RESEARCH_PHASE2_SYSTEM_PROMPT,
  AUDIENCE_RESEARCH_PHASE3_SYSTEM_PROMPT,
  BOOK_PITCH_SECTION_PLANS,
  BOOK_PITCH_SYSTEM_PROMPT,
  CORE_TRUTHS_SYSTEM_PROMPT,
  MARKET_REPORT_SYSTEM_PROMPT,
  POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT,
  TITLE_SUBTITLE_FINALIZATION_SYSTEM_PROMPT,
  TRANSFORMATION_ARC_SYSTEM_PROMPT,
} from "../src/lib/workflows/promise/generation-prompts";

test("BOOK_PITCH_SECTION_PLANS covers the full pitch package in stable order", () => {
  assert.deepEqual(
    BOOK_PITCH_SECTION_PLANS.map((plan) => plan.key),
    ["foundation", "market", "execution"],
  );
  assert.deepEqual(BOOK_PITCH_SECTION_PLANS[0]?.headings, [
    "EXECUTIVE SUMMARY",
    "SECTION 1: BOOK VISION",
    "SECTION 2: AUDIENCE & PERSONAS",
    "SECTION 3: TRANSFORMATION JOURNEY",
  ]);
  assert.deepEqual(BOOK_PITCH_SECTION_PLANS[2]?.headings.at(-1), "APPENDICES");
  assert.ok(
    BOOK_PITCH_SECTION_PLANS.every((plan) => plan.guidance.trim().length > 40),
    "each section plan should retain useful generation guidance",
  );
});

test("BOOK_PITCH_SYSTEM_PROMPT preserves markdown-only pitch package contract", () => {
  assert.match(BOOK_PITCH_SYSTEM_PROMPT, /Return MARKDOWN ONLY/);
  assert.match(BOOK_PITCH_SYSTEM_PROMPT, /SECTION 10: RECOMMENDATIONS & NEXT STEPS/);
  assert.match(BOOK_PITCH_SYSTEM_PROMPT, /GO, NO_GO, or CONDITIONAL/);
  assert.match(BOOK_PITCH_SYSTEM_PROMPT, /Knowledge-base signals/);
});

test("AUDIENCE_RESEARCH_PHASE1_SYSTEM_PROMPT preserves discovery output contract", () => {
  assert.match(AUDIENCE_RESEARCH_PHASE1_SYSTEM_PROMPT, /5-7 deeply probing research questions/);
  assert.match(AUDIENCE_RESEARCH_PHASE1_SYSTEM_PROMPT, /identifiedUserTypes/);
  assert.match(AUDIENCE_RESEARCH_PHASE1_SYSTEM_PROMPT, /Return JSON only/);
  assert.match(AUDIENCE_RESEARCH_PHASE1_SYSTEM_PROMPT, /not "everyone"/);
});

test("AUDIENCE_RESEARCH_PHASE2_SYSTEM_PROMPT preserves persona output contract", () => {
  assert.match(AUDIENCE_RESEARCH_PHASE2_SYSTEM_PROMPT, /Generate exactly the number of personas requested/);
  assert.match(AUDIENCE_RESEARCH_PHASE2_SYSTEM_PROMPT, /`yearsInRole` and `teamSize` must be JSON numbers/);
  assert.match(AUDIENCE_RESEARCH_PHASE2_SYSTEM_PROMPT, /"voiceBlendFit"/);
  assert.match(AUDIENCE_RESEARCH_PHASE2_SYSTEM_PROMPT, /"reportsTo"/);
});

test("AUDIENCE_RESEARCH_PHASE3_SYSTEM_PROMPT preserves persona comparison output contract", () => {
  assert.match(AUDIENCE_RESEARCH_PHASE3_SYSTEM_PROMPT, /Use the exact persona names/);
  assert.match(AUDIENCE_RESEARCH_PHASE3_SYSTEM_PROMPT, /Include 3-5 common themes/);
  assert.match(AUDIENCE_RESEARCH_PHASE3_SYSTEM_PROMPT, /"comparisonMatrix"/);
  assert.match(AUDIENCE_RESEARCH_PHASE3_SYSTEM_PROMPT, /Return JSON only/);
});

test("MARKET_REPORT_SYSTEM_PROMPT preserves market report output contract", () => {
  assert.match(MARKET_REPORT_SYSTEM_PROMPT, /Return JSON only, matching MarketReport exactly/);
  assert.match(MARKET_REPORT_SYSTEM_PROMPT, /goNoGoRecommendation/);
  assert.match(MARKET_REPORT_SYSTEM_PROMPT, /qualified estimates/);
  assert.match(MARKET_REPORT_SYSTEM_PROMPT, /academicToPractical/);
});

test("POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT preserves recommendations output contract", () => {
  assert.match(POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT, /Return JSON only, matching PositioningRecommendations exactly/);
  assert.match(POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT, /personaStrategies/);
  assert.match(POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT, /finalRecommendation\.overallRecommendation/);
  assert.match(POSITIONING_RECOMMENDATIONS_SYSTEM_PROMPT, /concrete enough to execute before Outline/);
});

test("TITLE_SUBTITLE_FINALIZATION_SYSTEM_PROMPT preserves title package output contract", () => {
  assert.match(TITLE_SUBTITLE_FINALIZATION_SYSTEM_PROMPT, /Return JSON only, matching TitleSubtitleFinalization exactly/);
  assert.match(TITLE_SUBTITLE_FINALIZATION_SYSTEM_PROMPT, /Treat prior phases as binding context/);
  assert.match(TITLE_SUBTITLE_FINALIZATION_SYSTEM_PROMPT, /audience segment language/);
  assert.match(TITLE_SUBTITLE_FINALIZATION_SYSTEM_PROMPT, /alternatives should contain 2-4 viable fallback packages/);
});

test("CORE_TRUTHS_SYSTEM_PROMPT preserves core truth output contract", () => {
  assert.match(CORE_TRUTHS_SYSTEM_PROMPT, /synthesize ONE governing truth/);
  assert.match(CORE_TRUTHS_SYSTEM_PROMPT, /voiceBlendResonates\.voice must be one of/);
  assert.match(CORE_TRUTHS_SYSTEM_PROMPT, /Return exactly 3 persona experiences/);
  assert.match(CORE_TRUTHS_SYSTEM_PROMPT, /Return JSON only, matching CoreTruthsArtifact exactly/);
});

test("TRANSFORMATION_ARC_SYSTEM_PROMPT preserves transformation output contract", () => {
  assert.match(TRANSFORMATION_ARC_SYSTEM_PROMPT, /ME-WE-TRUTH-YOU-WE/);
  assert.match(TRANSFORMATION_ARC_SYSTEM_PROMPT, /Stage 7: Book Map Framework/);
  assert.match(TRANSFORMATION_ARC_SYSTEM_PROMPT, /Use the first three personas available/);
  assert.match(TRANSFORMATION_ARC_SYSTEM_PROMPT, /Return JSON only, matching TransformationArtifact exactly/);
});
