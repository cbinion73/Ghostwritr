/**
 * VALIDATION SCORING ENGINE
 * Core calculation logic for market viability framework
 */

export interface DimensionScore {
  name: string;
  score: number; // 1-5
  weight: number;
  gateThreshold: number;
  evidence: string[];
  improvementPlan?: string;
}

export interface ValidationResult {
  totalScore: number;
  dimensions: DimensionScore[];
  gateDecision: "proceed" | "refine-first" | "archive";
  interpretation: string;
  improvementPlan: string[];
  bottlenecks: DimensionScore[];
}

// Dimension definitions with weights and gate thresholds
export const VALIDATION_DIMENSIONS = {
  "problem-validation": {
    name: "Problem Validation",
    weight: 0.15,
    gateThreshold: 3.5,
    description: "Is the problem real, frequent, severe, actively being solved?"
  },
  "audience-clarity": {
    name: "Audience Clarity",
    weight: 0.1,
    gateThreshold: 3.5,
    description: "Can you clearly identify who will buy this?"
  },
  "audience-accessibility": {
    name: "Audience Accessibility",
    weight: 0.1,
    gateThreshold: 3.0,
    description: "Can you actually reach this audience?"
  },
  "competitive-landscape": {
    name: "Competitive Landscape",
    weight: 0.15,
    gateThreshold: 3.5,
    description: "Do competitors exist? Are market gaps clear?"
  },
  "differentiation": {
    name: "Differentiation",
    weight: 0.15,
    gateThreshold: 3.0,
    description: "Is your book genuinely different from competitors?"
  },
  "practical-usability": {
    name: "Practical Usability",
    weight: 0.12,
    gateThreshold: 2.5,
    description: "Will readers actually apply what they learn?"
  },
  "completion-likelihood": {
    name: "Readability/Completion",
    weight: 0.1,
    gateThreshold: 2.5,
    description: "Will busy readers finish the book?"
  },
  "shareability": {
    name: "Shareability",
    weight: 0.05,
    gateThreshold: 2.0,
    description: "Will readers recommend it?"
  },
  "timing-trends": {
    name: "Timing & Trends",
    weight: 0.05,
    gateThreshold: 3.5,
    description: "Is topic growing? Relevant in 3-5 years?"
  },
  "commercial-value": {
    name: "Commercial Value",
    weight: 0.05,
    gateThreshold: 2.5,
    description: "Will this sell enough to justify writing?"
  },
  "author-credibility": {
    name: "Author Credibility",
    weight: 0.08,
    gateThreshold: 2.5,
    description: "Will readers trust this author?"
  }
};

/**
 * Calculate weighted validation score
 */
export function calculateValidationScore(dimensions: DimensionScore[]): ValidationResult {
  // Validate input
  if (!dimensions || dimensions.length === 0) {
    throw new Error("No dimensions provided for scoring");
  }

  // Calculate weighted total
  const totalScore = dimensions.reduce((sum, dim) => {
    const contribution = dim.score * dim.weight;
    return sum + contribution;
  }, 0);

  // Round to 2 decimal places
  const roundedTotal = Math.round(totalScore * 100) / 100;

  // Identify bottlenecks (dimensions below threshold)
  const bottlenecks = dimensions
    .filter(dim => dim.score < dim.gateThreshold)
    .sort((a, b) => a.score - b.score);

  // Determine gate decision
  let gateDecision: "proceed" | "refine-first" | "archive";
  let interpretation: string;

  if (roundedTotal >= 4.0) {
    gateDecision = "proceed";
    interpretation = "Exceptional opportunity - proceed with confidence";
  } else if (roundedTotal >= 3.5) {
    gateDecision = "refine-first";
    interpretation = "Viable but needs refinement - 4-6 weeks improvement plan";
  } else {
    gateDecision = "archive";
    interpretation = "Weak concept - archive and revisit in 6-12 months";
  }

  // Generate improvement plan
  const improvementPlan = bottlenecks.map(dim => {
    return `${dim.name} (${dim.score}/5) - Target: ${dim.gateThreshold}+ - ${dim.improvementPlan || "See detailed analysis"}`;
  });

  return {
    totalScore: roundedTotal,
    dimensions,
    gateDecision,
    interpretation,
    improvementPlan,
    bottlenecks
  };
}

/**
 * Check if dimension passes its gate requirement
 */
export function checkDimensionGate(dimension: DimensionScore): boolean {
  return dimension.score >= dimension.gateThreshold;
}

/**
 * Get all gate failures
 */
export function getGateFailures(dimensions: DimensionScore[]): DimensionScore[] {
  return dimensions.filter(dim => !checkDimensionGate(dim));
}

/**
 * Validate dimensions structure
 */
export function validateDimensions(dimensions: DimensionScore[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!Array.isArray(dimensions)) {
    errors.push("Dimensions must be an array");
    return { valid: false, errors };
  }

  dimensions.forEach((dim, index) => {
    if (!dim.name) errors.push(`Dimension ${index}: name is required`);
    if (typeof dim.score !== "number" || dim.score < 1 || dim.score > 5) {
      errors.push(`Dimension ${index}: score must be between 1 and 5`);
    }
    if (typeof dim.weight !== "number" || dim.weight <= 0) {
      errors.push(`Dimension ${index}: weight must be greater than 0`);
    }
    if (typeof dim.gateThreshold !== "number" || dim.gateThreshold < 1 || dim.gateThreshold > 5) {
      errors.push(`Dimension ${index}: gateThreshold must be between 1 and 5`);
    }
  });

  // Check that weights sum to approximately 1.0 (within 0.01)
  const totalWeight = dimensions.reduce((sum, dim) => sum + dim.weight, 0);
  if (Math.abs(totalWeight - 1.0) > 0.01) {
    errors.push(`Total weight is ${totalWeight}, should be 1.0`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get interpretation description for a score
 */
export function getScoreInterpretation(score: number): string {
  if (score >= 4.0) {
    return "Strong - proceed with confidence";
  } else if (score >= 3.5) {
    return "Viable - needs refinement (4-6 weeks)";
  } else if (score >= 3.0) {
    return "Risky - significant improvements needed";
  } else {
    return "Weak - archive or major rework required";
  }
}

/**
 * Get color for score visualization
 */
export function getScoreColor(score: number): string {
  if (score >= 4.0) return "text-green-600"; // Green
  if (score >= 3.5) return "text-amber-600"; // Yellow
  if (score >= 3.0) return "text-orange-600"; // Orange
  return "text-red-600"; // Red
}

/**
 * Format score for display
 */
export function formatScore(score: number): string {
  return score.toFixed(2);
}

/**
 * Calculate percentage for progress bar
 */
export function calculateScorePercentage(score: number): number {
  return (score / 5.0) * 100;
}
