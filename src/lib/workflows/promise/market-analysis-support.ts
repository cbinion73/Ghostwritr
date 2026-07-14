import type { MarketReport } from "../../promise-types";

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function coerceString(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

export function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceString(item, ""))
      .filter((item) => item.length > 0);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  return [];
}

export function normalizeRiskProfile(
  value: unknown,
  fallback: "Low" | "Medium" | "High",
): "Low" | "Medium" | "High" {
  if (value === "Low" || value === "Medium" || value === "High") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "low") return "Low";
    if (normalized === "medium") return "Medium";
    if (normalized === "high") return "High";
  }

  return fallback;
}

export function normalizeComparableSummary(
  value: unknown,
  index: number,
): MarketReport["comparisonTitles"][number] {
  const raw = asRecord(value);
  return {
    title: coerceString(raw.title, `Comparable Title ${index + 1}`),
    author: coerceString(raw.author, "Unknown Author"),
    whyRelevant: coerceString(raw.whyRelevant, "Addresses an adjacent reader problem in the same commercial space."),
    differenceOpportunity: coerceString(
      raw.differenceOpportunity,
      "Clarify the book's sharper promise, audience, and applied transformation.",
    ),
  };
}

export function normalizeMarketDirectCompetitor(
  value: unknown,
  index: number,
): MarketReport["competitiveLandscape"]["directCompetitors"][number] {
  const raw = asRecord(value);
  const summary = normalizeComparableSummary(value, index);

  return {
    ...summary,
    credentials: coerceString(raw.credentials, "Recognized voice in the category"),
    positioning: coerceString(
      raw.positioning,
      "Established business nonfiction positioning with a broad commercial appeal.",
    ),
    targetAudience: coerceString(
      raw.targetAudience,
      "Professionals actively looking for better performance, leadership, or decision frameworks.",
    ),
    strengths: coerceStringArray(raw.strengths),
    gaps: coerceStringArray(raw.gaps),
    estimatedSales: coerceString(raw.estimatedSales, "Commercially credible category comp; exact public sales data unavailable."),
    pricePoint: coerceString(raw.pricePoint, "Typical business nonfiction pricing across hardcover, paperback, ebook, and audio."),
  };
}

export function normalizeMarketIndirectCompetitor(
  value: unknown,
  index: number,
): MarketReport["competitiveLandscape"]["indirectCompetitors"][number] {
  const raw = asRecord(value);
  return {
    category: coerceString(raw.category, `Indirect Alternative ${index + 1}`),
    examples: coerceStringArray(raw.examples),
    currentAlternative: coerceString(
      raw.currentAlternative,
      "Readers currently solve this through internal playbooks, consultants, podcasts, or training.",
    ),
    spendProfile: coerceString(
      raw.spendProfile,
      "Spending is spread across time, attention, and selective budget on training or tools.",
    ),
  };
}

export function normalizeMarketPersonaUrgency(
  value: unknown,
  index: number,
  fallbackName: string,
): MarketReport["audienceDemand"]["personaUrgency"][number] {
  const raw = asRecord(value);
  return {
    personaName: coerceString(raw.personaName, fallbackName || `Persona ${index + 1}`),
    urgency: coerceString(
      raw.urgency,
      "The problem is meaningful enough to justify active learning, but the book must show immediate practical value.",
    ),
    whyNow: coerceString(
      raw.whyNow,
      "Pressure, complexity, and visible consequences make the existing approach feel less sustainable now.",
    ),
  };
}

export function normalizePricingTier(
  value: unknown,
  index: number,
): MarketReport["pricingStrategy"]["pricingTiers"][number] {
  const raw = asRecord(value);
  const formats = ["Hardcover", "Paperback", "Ebook", "Audiobook"];
  return {
    format: coerceString(raw.format, formats[index] ?? `Format ${index + 1}`),
    pricePoint: coerceString(raw.pricePoint, "Use a competitive business-book price band."),
    rationale: coerceString(
      raw.rationale,
      "Match category norms while signaling enough authority and practical value.",
    ),
  };
}

export function normalizeAncillaryProduct(
  value: unknown,
  index: number,
): MarketReport["monetizationEcosystem"]["ancillaryProducts"][number] {
  const raw = asRecord(value);
  return {
    channel: coerceString(raw.channel, `Offer ${index + 1}`),
    offer: coerceString(raw.offer, "An adjacent offer that deepens the book's framework."),
    pricePoint: coerceString(raw.pricePoint, "Price to reflect the value and delivery depth."),
    revenuePotential: coerceString(
      raw.revenuePotential,
      "Modest at launch; stronger once the book validates demand and authority.",
    ),
  };
}
