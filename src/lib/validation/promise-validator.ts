import type { PromiseBrief, PersonaPack, MarketReport } from "@/lib/promise-types";

export interface ValidationScores {
  personaMatch: {
    score: number; // 0-100
    breakdown: {
      endUserValidation: number;
      painPointSpecificity: number;
      promiseAlignment: number;
      buyingPower: number;
    };
    feedback: string[];
  };
  marketViability: {
    score: number; // 0-100
    breakdown: {
      marketSize: number;
      comparableTitles: number;
      differentiation: number;
      reachability: number;
    };
    feedback: string[];
    marketResearch?: {
      marketSize?: string;
      trends?: string;
      comparableBooks?: string[];
    };
  };
  promiseQuality: {
    score: number; // 0-100
    breakdown: {
      specificity: number;
      differentiation: number;
      credibility: number;
      problemPriority: number;
    };
    feedback: string[];
  };
  triangulation: {
    isAligned: boolean;
    gaps: string[];
    suggestions: string[];
  };
  isReady: boolean; // All scores >= 80
  lastValidated: Date;
}

export function scorePersonaMatch(
  promise: PromiseBrief,
  personas: PersonaPack
): ValidationScores["personaMatch"] {
  const breakdown = {
    endUserValidation: 0,
    painPointSpecificity: 0,
    promiseAlignment: 0,
    buyingPower: 0,
  };
  const feedback: string[] = [];

  // 1. End User Validation (25 points)
  if (personas?.personas && personas.personas.length > 0) {
    const allEndUsers = personas.personas.every(
      (p) => !p.context?.toLowerCase().includes("manager")
    );
    if (allEndUsers) {
      breakdown.endUserValidation = 25;
      feedback.push("✓ All personas are real end users");
    } else {
      breakdown.endUserValidation = 15;
      feedback.push("⚠ Some personas may be managers rather than end users");
    }
  } else {
    breakdown.endUserValidation = 0;
    feedback.push("✗ No personas defined yet");
  }

  // 2. Pain Point Specificity (25 points)
  if (personas?.personas) {
    const avgPainPoints =
      personas.personas.reduce((sum, p) => sum + (p.painPoints?.length || 0), 0) /
      Math.max(personas.personas.length, 1);

    if (avgPainPoints >= 3) {
      breakdown.painPointSpecificity = 25;
      feedback.push(`✓ Personas have ${avgPainPoints.toFixed(1)} specific pain points each`);
    } else if (avgPainPoints >= 2) {
      breakdown.painPointSpecificity = 15;
      feedback.push(`⚠ Average ${avgPainPoints.toFixed(1)} pain points per persona (target: 3+)`);
    } else {
      breakdown.painPointSpecificity = 5;
      feedback.push(`✗ Pain points are too generic (${avgPainPoints.toFixed(1)} per persona)`);
    }
  }

  // 3. Promise Alignment (25 points)
  if (personas?.personas && promise.promiseStatement) {
    const promiseLower = promise.promiseStatement.toLowerCase();
    let alignmentCount = 0;

    personas.personas.forEach((persona) => {
      persona.painPoints?.forEach((pain) => {
        if (
          promiseLower.includes(pain.toLowerCase().split(" ").slice(0, 3).join(" "))
        ) {
          alignmentCount++;
        }
      });
    });

    if (alignmentCount >= 3) {
      breakdown.promiseAlignment = 25;
      feedback.push(`✓ Promise addresses ${alignmentCount}+ persona pain points`);
    } else if (alignmentCount >= 2) {
      breakdown.promiseAlignment = 15;
      feedback.push(`⚠ Promise addresses ${alignmentCount} pain points (target: 3+)`);
    } else {
      breakdown.promiseAlignment = 5;
      feedback.push(`✗ Promise doesn't clearly address persona pain points`);
    }
  }

  // 4. Buying Power (25 points)
  if (personas?.personas) {
    const commerciallyViable = personas.personas.some(
      (p) =>
        p.context?.toLowerCase().includes("executive") ||
        p.context?.toLowerCase().includes("leader") ||
        p.context?.toLowerCase().includes("director")
    );

    if (commerciallyViable) {
      breakdown.buyingPower = 25;
      feedback.push("✓ Personas include decision-makers with buying power");
    } else {
      breakdown.buyingPower = 15;
      feedback.push("⚠ Verify that personas have purchasing authority");
    }
  }

  // The four pillars are already weighted to sum to 100 (25×4) — no divisor.
  const score = Math.round(
    breakdown.endUserValidation +
      breakdown.painPointSpecificity +
      breakdown.promiseAlignment +
      breakdown.buyingPower
  );

  return {
    score,
    breakdown,
    feedback,
  };
}

export function scorePromiseQuality(promise: PromiseBrief): ValidationScores["promiseQuality"] {
  const breakdown = {
    specificity: 0,
    differentiation: 0,
    credibility: 0,
    problemPriority: 0,
  };
  const feedback: string[] = [];

  const statement = promise.promiseStatement || "";

  // 1. Specificity (25 points)
  const hasSpecificOutcome =
    statement.includes("will") && statement.length > 200 && statement.includes(".");
  const hasMechanism = statement.toLowerCase().includes("system") ||
    statement.toLowerCase().includes("framework") ||
    statement.toLowerCase().includes("method") ||
    statement.toLowerCase().includes("approach");

  if (hasSpecificOutcome && hasMechanism) {
    breakdown.specificity = 25;
    feedback.push("✓ Promise is specific with clear mechanism");
  } else if (hasSpecificOutcome) {
    breakdown.specificity = 15;
    feedback.push("⚠ Promise outcome is clear but mechanism could be clearer");
  } else {
    breakdown.specificity = 5;
    feedback.push("✗ Promise lacks specificity or clear outcome");
  }

  // 2. Differentiation (25 points)
  const hasOwnable =
    statement.toLowerCase().includes("not") ||
    statement.toLowerCase().includes("instead of") ||
    statement.toLowerCase().includes("unlike");

  if (hasOwnable && statement.length > 300) {
    breakdown.differentiation = 25;
    feedback.push("✓ Promise clearly differentiates from alternatives");
  } else if (hasOwnable) {
    breakdown.differentiation = 15;
    feedback.push("⚠ Promise touches on differentiation but could be stronger");
  } else {
    breakdown.differentiation = 5;
    feedback.push("✗ Promise lacks clear differentiation");
  }

  // 3. Credibility (25 points)
  const isCredible =
    !statement.toLowerCase().includes("guarantee") &&
    !statement.toLowerCase().includes("instantly") &&
    !statement.toLowerCase().includes("without effort") &&
    statement.toLowerCase().includes("practical");

  if (isCredible) {
    breakdown.credibility = 25;
    feedback.push("✓ Promise is realistic and achievable");
  } else {
    breakdown.credibility = 15;
    feedback.push("⚠ Ensure promise is credible and achievable through reading");
  }

  // 4. Problem Priority (25 points)
  const addressesProblem =
    statement.toLowerCase().includes("problem") ||
    statement.toLowerCase().includes("challenge") ||
    statement.toLowerCase().includes("pain") ||
    statement.toLowerCase().includes("struggle");

  if (addressesProblem && statement.includes(promise.coreTruth || "")) {
    breakdown.problemPriority = 25;
    feedback.push("✓ Promise addresses a high-priority problem");
  } else if (addressesProblem) {
    breakdown.problemPriority = 15;
    feedback.push("⚠ Verify this is a high-priority problem for the audience");
  } else {
    breakdown.problemPriority = 5;
    feedback.push("✗ Promise doesn't clearly address a market problem");
  }

  // The four pillars are already weighted to sum to 100 (25×4) — no divisor.
  const score = Math.round(
    breakdown.specificity +
      breakdown.differentiation +
      breakdown.credibility +
      breakdown.problemPriority
  );

  return {
    score,
    breakdown,
    feedback,
  };
}

export function scoreMarketViability(
  market: MarketReport,
  marketResearch?: {
    marketSize?: string;
    trends?: string;
    comparableBooks?: string[];
  }
): ValidationScores["marketViability"] {
  const breakdown = {
    marketSize: 0,
    comparableTitles: 0,
    differentiation: 0,
    reachability: 0,
  };
  const feedback: string[] = [];

  // 1. Market Size & Demand (30 points)
  if (marketResearch?.trends?.toLowerCase().includes("grow")) {
    breakdown.marketSize = 30;
    feedback.push("✓ Market is growing with strong demand signals");
  } else if (market?.marketCategory) {
    breakdown.marketSize = 20;
    feedback.push("⚠ Market exists with moderate demand");
  } else {
    breakdown.marketSize = 10;
    feedback.push("✗ Limited market size or demand data");
  }

  // 2. Comparable Titles & Sales (25 points)
  const comparableCount = marketResearch?.comparableBooks?.length || 0;

  if (comparableCount >= 5) {
    breakdown.comparableTitles = 25;
    feedback.push(`✓ ${comparableCount} successful comparable titles found`);
  } else if (comparableCount >= 3) {
    breakdown.comparableTitles = 20;
    feedback.push(`✓ ${comparableCount} comparable titles in market`);
  } else if (comparableCount >= 1) {
    breakdown.comparableTitles = 10;
    feedback.push(`⚠ Limited comparable titles (${comparableCount})`);
  } else {
    breakdown.comparableTitles = 0;
    feedback.push("✗ No comparable successful books found");
  }

  // 3. Differentiation (25 points)
  const hasUniqueAngle = market?.comparisonTitles?.some(
    (comp) => comp.differenceOpportunity && comp.differenceOpportunity.length > 20
  );

  if (hasUniqueAngle) {
    breakdown.differentiation = 25;
    feedback.push("✓ Clear differentiation opportunity vs. competitors");
  } else if (marketResearch?.comparableBooks && marketResearch.comparableBooks.length > 0) {
    breakdown.differentiation = 15;
    feedback.push("⚠ Crowded but your angle could be differentiating");
  } else {
    breakdown.differentiation = 5;
    feedback.push("✗ Unclear how you'll differentiate");
  }

  // 4. Audience Reachability (20 points)
  const hasMultipleChannels =
    market?.attractionDrivers && market.attractionDrivers.length >= 2;

  if (hasMultipleChannels) {
    breakdown.reachability = 20;
    feedback.push("✓ Multiple channels to reach audience");
  } else if (market?.attractionDrivers && market.attractionDrivers.length >= 1) {
    breakdown.reachability = 12;
    feedback.push("⚠ Some audience reach channels available");
  } else {
    breakdown.reachability = 5;
    feedback.push("✗ Limited visibility into how to reach audience");
  }

  // The four pillars are already weighted to sum to 100 (30+25+25+20) — no
  // divisor. (A previous /4 capped this score at 25, making the 70/80-point
  // gates structurally impossible to pass.)
  const score = Math.round(
    breakdown.marketSize + breakdown.comparableTitles + breakdown.differentiation + breakdown.reachability
  );

  return {
    score,
    breakdown,
    feedback,
    marketResearch,
  };
}

export function validateTriangulation(
  personaScore: number,
  marketScore: number,
  promiseScore: number
): ValidationScores["triangulation"] {
  const gaps: string[] = [];
  const suggestions: string[] = [];

  if (personaScore < 80) {
    gaps.push("Persona alignment needs improvement");
    suggestions.push("Refine personas to be more specific end users with validated pain points");
  }

  if (marketScore < 80) {
    gaps.push("Market viability needs validation");
    suggestions.push("Strengthen market differentiation and demonstrate audience demand");
  }

  if (promiseScore < 80) {
    gaps.push("Promise quality needs enhancement");
    suggestions.push("Make promise more specific, differentiated, and credible");
  }

  const isAligned =
    personaScore >= 70 &&
    marketScore >= 70 &&
    promiseScore >= 70 &&
    Math.abs(personaScore - marketScore) < 20 &&
    Math.abs(marketScore - promiseScore) < 20;

  return {
    isAligned,
    gaps,
    suggestions,
  };
}

export function createValidationScores(
  promise: PromiseBrief,
  personas: PersonaPack,
  market: MarketReport,
  marketResearch?: {
    marketSize?: string;
    trends?: string;
    comparableBooks?: string[];
  }
): ValidationScores {
  const personaMatch = scorePersonaMatch(promise, personas);
  const promiseQuality = scorePromiseQuality(promise);
  const marketViability = scoreMarketViability(market, marketResearch);
  const triangulation = validateTriangulation(
    personaMatch.score,
    marketViability.score,
    promiseQuality.score
  );

  return {
    personaMatch,
    marketViability,
    promiseQuality,
    triangulation,
    isReady: personaMatch.score >= 80 && marketViability.score >= 80 && promiseQuality.score >= 80,
    lastValidated: new Date(),
  };
}
