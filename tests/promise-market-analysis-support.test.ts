import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAncillaryProduct,
  normalizeComparableSummary,
  normalizeMarketDirectCompetitor,
  normalizeMarketIndirectCompetitor,
  normalizeMarketPersonaUrgency,
  normalizePricingTier,
  normalizeRiskProfile,
} from "../src/lib/workflows/promise/market-analysis-support";

test("market normalization support coerces risk profiles safely", () => {
  assert.equal(normalizeRiskProfile("high", "Low"), "High");
  assert.equal(normalizeRiskProfile(" Medium ", "Low"), "Medium");
  assert.equal(normalizeRiskProfile("not-a-risk", "Low"), "Low");
});

test("market normalization support fills comparable and competitor defaults", () => {
  assert.deepEqual(normalizeComparableSummary({ title: "Comp", author: "Author" }, 0), {
    title: "Comp",
    author: "Author",
    whyRelevant: "Addresses an adjacent reader problem in the same commercial space.",
    differenceOpportunity: "Clarify the book's sharper promise, audience, and applied transformation.",
  });

  const competitor = normalizeMarketDirectCompetitor(
    {
      title: "Comp",
      author: "Author",
      strengths: "Strong platform",
      gaps: ["Needs more action"],
    },
    0,
  );

  assert.equal(competitor.credentials, "Recognized voice in the category");
  assert.deepEqual(competitor.strengths, ["Strong platform"]);
  assert.deepEqual(competitor.gaps, ["Needs more action"]);
});

test("market normalization support normalizes indirect competitors and persona urgency", () => {
  assert.deepEqual(normalizeMarketIndirectCompetitor({ examples: ["Course"] }, 1), {
    category: "Indirect Alternative 2",
    examples: ["Course"],
    currentAlternative: "Readers currently solve this through internal playbooks, consultants, podcasts, or training.",
    spendProfile: "Spending is spread across time, attention, and selective budget on training or tools.",
  });

  assert.deepEqual(normalizeMarketPersonaUrgency({}, 0, "Ops Leader"), {
    personaName: "Ops Leader",
    urgency: "The problem is meaningful enough to justify active learning, but the book must show immediate practical value.",
    whyNow: "Pressure, complexity, and visible consequences make the existing approach feel less sustainable now.",
  });
});

test("market normalization support preserves pricing and ancillary product defaults", () => {
  assert.deepEqual(normalizePricingTier({}, 2), {
    format: "Ebook",
    pricePoint: "Use a competitive business-book price band.",
    rationale: "Match category norms while signaling enough authority and practical value.",
  });

  assert.deepEqual(normalizeAncillaryProduct({ channel: "Workshop" }, 0), {
    channel: "Workshop",
    offer: "An adjacent offer that deepens the book's framework.",
    pricePoint: "Price to reflect the value and delivery depth.",
    revenuePotential: "Modest at launch; stronger once the book validates demand and authority.",
  });
});
