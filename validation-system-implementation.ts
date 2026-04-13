/**
 * GHOSTWRITR VALIDATION SYSTEM
 * Core implementation for 13-phase market viability framework
 *
 * Files to be integrated into src/ directory
 */

// ============================================================================
// 1. DATABASE SCHEMA (Prisma)
// ============================================================================
// File: prisma/schema.prisma

/*
model ValidationPhase {
  id                String   @id @default(cuid())
  bookId            String
  book              Book     @relation(fields: [bookId], references: [id], onDelete: Cascade)
  phaseNumber       Int      // 1-13
  phaseName         String   // "Problem Validation", "Audience & Access", etc.
  status            String   @default("not-started") // not-started, in-progress, complete
  gateRequirement   String?  // e.g., "differentiation >= 3.5"
  score             Float    @default(0) // 1-5
  evidence          String[] // Array of sources/URLs
  userResponses     Json     // Stores all step responses
  completedAt       DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([bookId])
  @@unique([bookId, phaseNumber])
}

model ValidationDimension {
  id                String   @id @default(cuid())
  bookId            String
  book              Book     @relation(fields: [bookId], references: [id], onDelete: Cascade)
  dimensionName     String   // e.g., "Differentiation"
  score             Float    @default(0) // 1-5
  weight            Float    // e.g., 0.15 for 15%
  evidence          String[] // Sources used
  improvementPlan   String?
  gateStatus        String   @default("pending") // pass, fail, pending
  updatedAt         DateTime @updatedAt

  @@index([bookId])
  @@unique([bookId, dimensionName])
}

model BookValidation {
  id                String   @id @default(cuid())
  bookId            String   @unique
  book              Book     @relation(fields: [bookId], references: [id], onDelete: Cascade)
  totalScore        Float    @default(0)
  status            String   @default("not-started") // not-started, in-progress, complete
  gateDecision      String   @default("pending") // proceed, refine-first, archive
  improvementPlan   String?  // JSON: list of improvements needed
  startedAt         DateTime?
  completedAt       DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  phases            ValidationPhase[]
  dimensions        ValidationDimension[]
}

// Add to Book model:
validation           BookValidation?
validationPhases     ValidationPhase[]
validationDimensions ValidationDimension[]
*/

// ============================================================================
// 2. CORE SCORING LOGIC
// ============================================================================
// File: src/lib/validation/scoring-engine.ts

export interface DimensionScore {
  name: string
  score: number // 1-5
  weight: number
  gateThreshold: number
  evidence: string[]
  improvementPlan?: string
}

export interface ValidationResult {
  totalScore: number
  dimensions: DimensionScore[]
  gateDecision: "proceed" | "refine-first" | "archive"
  interpretation: string
  improvementPlan: string[]
}

export const VALIDATION_DIMENSIONS = {
  PROBLEM_VALIDATION: {
    name: "Problem Validation",
    weight: 0.15,
    gateThreshold: 3.5,
    description: "Is the problem real, frequent, severe, actively being solved?"
  },
  AUDIENCE_CLARITY: {
    name: "Audience Clarity",
    weight: 0.10,
    gateThreshold: 3.5,
    description: "Can you clearly identify who will buy this?"
  },
  AUDIENCE_ACCESSIBILITY: {
    name: "Audience Accessibility",
    weight: 0.10,
    gateThreshold: 3.0,
    description: "Can you actually reach this audience?"
  },
  COMPETITIVE_LANDSCAPE: {
    name: "Competitive Landscape",
    weight: 0.15,
    gateThreshold: 3.5,
    description: "Do competitors exist? Are market gaps clear?"
  },
  DIFFERENTIATION: {
    name: "Differentiation",
    weight: 0.15,
    gateThreshold: 3.0,
    description: "Is your book genuinely different from competitors?"
  },
  PRACTICAL_USABILITY: {
    name: "Practical Usability",
    weight: 0.12,
    gateThreshold: 2.5,
    description: "Will readers actually apply what they learn?"
  },
  COMPLETION_LIKELIHOOD: {
    name: "Readability/Completion",
    weight: 0.10,
    gateThreshold: 2.5,
    description: "Will busy readers finish the book?"
  },
  SHAREABILITY: {
    name: "Shareability",
    weight: 0.05,
    gateThreshold: 2.0,
    description: "Will readers recommend it?"
  },
  TIMING: {
    name: "Timing & Trends",
    weight: 0.05,
    gateThreshold: 3.5,
    description: "Is topic growing? Relevant in 3-5 years?"
  },
  COMMERCIAL_VALUE: {
    name: "Commercial Value",
    weight: 0.05,
    gateThreshold: 2.5,
    description: "Will this sell enough to justify writing?"
  },
  AUTHOR_CREDIBILITY: {
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
  // Calculate weighted total
  const totalScore = dimensions.reduce((sum, dim) => {
    return sum + (dim.score * dim.weight);
  }, 0);

  // Determine gate decision
  let gateDecision: "proceed" | "refine-first" | "archive";
  let interpretation: string;

  if (totalScore >= 4.0) {
    gateDecision = "proceed";
    interpretation = "Exceptional opportunity - proceed with confidence";
  } else if (totalScore >= 3.5) {
    gateDecision = "refine-first";
    interpretation = "Viable but needs refinement - 4-6 weeks improvement plan";
  } else {
    gateDecision = "archive";
    interpretation = "Weak concept - archive and revisit in 6-12 months";
  }

  // Identify critical weaknesses (bottlenecks)
  const bottlenecks = dimensions
    .filter(dim => dim.score < 3.0)
    .sort((a, b) => a.score - b.score);

  // Generate improvement plan
  const improvementPlan = bottlenecks.map(dim => {
    const threshold = VALIDATION_DIMENSIONS[
      Object.keys(VALIDATION_DIMENSIONS).find(
        key => VALIDATION_DIMENSIONS[key].name === dim.name
      )
    ]?.gateThreshold || 3.0;

    return `${dim.name} (${dim.score}/5) - Target: ${threshold}+ - ${dim.improvementPlan || "See detailed analysis"}`;
  });

  return {
    totalScore: Math.round(totalScore * 100) / 100,
    dimensions,
    gateDecision,
    interpretation,
    improvementPlan
  };
}

/**
 * Check if dimension passes its gate requirement
 */
export function checkGate(dimension: DimensionScore): boolean {
  return dimension.score >= dimension.gateThreshold;
}

/**
 * Get all gate failures
 */
export function getGateFailures(dimensions: DimensionScore[]): DimensionScore[] {
  return dimensions.filter(dim => !checkGate(dim));
}

// ============================================================================
// 3. VALIDATION PHASE DEFINITIONS
// ============================================================================
// File: src/lib/validation/phases.ts

export interface ValidationPhaseDefinition {
  id: string
  number: number
  name: string
  week: string
  estimatedDays: number
  gateRequirement?: {
    dimensionId: string
    minimumScore: number
  }
  steps: ValidationStepDefinition[]
  description: string
}

export interface ValidationStepDefinition {
  id: string
  title: string
  instructions: string
  inputType: "text" | "textarea" | "select" | "score" | "research"
  guidance: string
  exampleGood?: string
  exampleBad?: string
}

export const VALIDATION_PHASES: ValidationPhaseDefinition[] = [
  {
    id: "phase-1-2",
    number: 1,
    name: "Problem Validation",
    week: "Week 1",
    estimatedDays: 7,
    gateRequirement: {
      dimensionId: "problem-validation",
      minimumScore: 3.5
    },
    description: "Prove the problem is real, frequent, severe, and actively being solved",
    steps: [
      {
        id: "1.1",
        title: "Define Core Problem",
        instructions: "Distill the book's core problem to one clear sentence",
        inputType: "textarea",
        guidance: "Can a 10-year-old understand it? Remove all adjectives.",
        exampleGood: "Lab leaders can't delegate without their lab breaking",
        exampleBad: "Lab professionals struggle with complex leadership transition challenges"
      },
      {
        id: "1.2",
        title: "Assess Frequency",
        instructions: "How often does this problem occur? What % of target audience?",
        inputType: "textarea",
        guidance: "Look for: academic papers, industry reports, surveys, forum discussions",
        exampleGood: "80%+ of PIs report spending 8+ hours/week on coordination tasks"
      },
      {
        id: "1.3",
        title: "Quantify Severity",
        instructions: "What is the time, cost, stress, and career impact?",
        inputType: "textarea",
        guidance: "Be specific: hours/week, $amount lost, career publication impact",
        exampleGood: "$77k/year lost research productivity per PI"
      },
      {
        id: "1.4",
        title: "Validate Active Solving",
        instructions: "Is target audience actively paying to solve this?",
        inputType: "textarea",
        guidance: "Evidence: university programs, competing books, consultant spending",
        exampleGood: "Universities spending $M+ annually on leadership training"
      }
    ]
  },
  {
    id: "phase-2-3",
    number: 2,
    name: "Audience & Accessibility",
    week: "Week 2",
    estimatedDays: 7,
    description: "Identify primary buyer and confirm you can reach them",
    steps: [
      {
        id: "2.1",
        title: "Primary Buyer Persona",
        instructions: "Who will actually buy this? Job title, budget, pain, motivation?",
        inputType: "textarea",
        guidance: "Specific: not 'managers' but 'Principal Investigators with $1M+ budgets'",
        exampleGood: "Dr. Rachel Martinez - PI, controls $1.2M budget, 8+ hours/week lost"
      },
      {
        id: "2.2",
        title: "Learning Preferences",
        instructions: "How does this audience currently learn? Books? Courses? Conferences?",
        inputType: "textarea",
        guidance: "Research: survey results, platform adoption rates, channel analysis"
      },
      {
        id: "2.3",
        title: "Distribution Channels",
        instructions: "List 3+ realistic channels to reach primary buyer",
        inputType: "textarea",
        guidance: "Be specific: 'university faculty development' not 'online marketing'",
        exampleGood: "University partnerships (200+ universities), Academic conferences, LinkedIn targeting"
      }
    ]
  },
  {
    id: "phase-3-4",
    number: 3,
    name: "Competitive Landscape",
    week: "Week 2-3",
    estimatedDays: 10,
    gateRequirement: {
      dimensionId: "competitive-landscape",
      minimumScore: 3.5
    },
    description: "Identify competitors and market gaps",
    steps: [
      {
        id: "3.1",
        title: "Find Competitors",
        instructions: "List 5-10 books/solutions solving same problem",
        inputType: "textarea",
        guidance: "Search: Amazon, Google Scholar, industry sites, Udemy, Coursera"
      },
      {
        id: "3.2",
        title: "Analyze Each",
        instructions: "For each: Promise, strengths, weaknesses, reviews, price",
        inputType: "textarea",
        guidance: "Look at 1-star AND 5-star reviews for real insights"
      },
      {
        id: "3.3",
        title: "Identify Gaps",
        instructions: "What are competitors NOT addressing?",
        inputType: "textarea",
        guidance: "Example gaps: 'No systems-based approach' or 'No multi-persona strategy'",
        exampleGood: "Gap: No book addresses organizational barriers to delegation"
      }
    ]
  },
  {
    id: "phase-4",
    number: 4,
    name: "Differentiation Analysis",
    week: "Week 3",
    estimatedDays: 7,
    gateRequirement: {
      dimensionId: "differentiation",
      minimumScore: 3.0
    },
    description: "Define clear, defensible differentiation",
    steps: [
      {
        id: "4.1",
        title: "Write Differentiation",
        instructions: "\"Unlike [competitors who promise X], we [specific unique thing]\"",
        inputType: "textarea",
        guidance: "Can reader explain this in one sentence? If not, refine.",
        exampleGood: "Unlike books that teach soft skills, we restructure lab operations"
      },
      {
        id: "4.2",
        title: "Reality Check",
        instructions: "Can we actually deliver on this? Is it based on real experience?",
        inputType: "textarea",
        guidance: "Be honest. If unclear, it's a problem."
      }
    ]
  },
  // ... phases 5-13 continue with similar structure
  // (abbreviated for space, but follow same pattern)
];

// ============================================================================
// 4. SERVER ACTION: SAVE VALIDATION PHASE
// ============================================================================
// File: src/app/books/[slug]/promise/actions.ts (ADD TO EXISTING)

"use server";

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { calculateValidationScore, VALIDATION_DIMENSIONS } from "@/lib/validation/scoring-engine";

export async function saveValidationPhase(
  bookId: string,
  phaseNumber: number,
  phaseResponses: Record<string, any>,
  score: number,
  evidence: string[]
) {
  try {
    console.log(`[saveValidationPhase] Saving phase ${phaseNumber} for book ${bookId}`);

    // Save phase data
    const phase = await prisma.validationPhase.upsert({
      where: {
        bookId_phaseNumber: {
          bookId,
          phaseNumber
        }
      },
      create: {
        bookId,
        phaseNumber,
        phaseName: VALIDATION_PHASES[phaseNumber - 1].name,
        score,
        evidence,
        userResponses: phaseResponses,
        status: "complete",
        completedAt: new Date()
      },
      update: {
        score,
        evidence,
        userResponses: phaseResponses,
        status: "complete",
        completedAt: new Date()
      }
    });

    // Update dimension scores (if this phase impacts a dimension)
    if (VALIDATION_PHASES[phaseNumber - 1].gateRequirement) {
      const dimensionName = VALIDATION_PHASES[phaseNumber - 1].gateRequirement.dimensionId;

      await prisma.validationDimension.upsert({
        where: {
          bookId_dimensionName: {
            bookId,
            dimensionName
          }
        },
        create: {
          bookId,
          dimensionName,
          score,
          weight: VALIDATION_DIMENSIONS[dimensionName]?.weight || 0.1,
          evidence
        },
        update: {
          score,
          evidence,
          updatedAt: new Date()
        }
      });
    }

    revalidatePath(`/books/${bookId}/promise`);

    return {
      success: true,
      phase,
      message: `Phase ${phaseNumber} saved successfully`
    };
  } catch (error) {
    console.error("[saveValidationPhase] Error:", error);
    return {
      success: false,
      message: `Failed to save phase: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Calculate total validation score and update gate decision
 */
export async function recalculateValidationScore(bookId: string) {
  try {
    console.log(`[recalculateValidationScore] Calculating score for book ${bookId}`);

    // Get all dimensions
    const dimensions = await prisma.validationDimension.findMany({
      where: { bookId }
    });

    if (dimensions.length === 0) {
      return {
        success: false,
        message: "No validation dimensions found"
      };
    }

    // Calculate score
    const result = calculateValidationScore(
      dimensions.map(d => ({
        name: d.dimensionName,
        score: d.score,
        weight: d.weight,
        gateThreshold: VALIDATION_DIMENSIONS[d.dimensionName]?.gateThreshold || 3.0,
        evidence: d.evidence
      }))
    );

    // Update BookValidation
    const validation = await prisma.bookValidation.upsert({
      where: { bookId },
      create: {
        bookId,
        totalScore: result.totalScore,
        status: "in-progress",
        gateDecision: result.gateDecision,
        improvementPlan: JSON.stringify(result.improvementPlan)
      },
      update: {
        totalScore: result.totalScore,
        gateDecision: result.gateDecision,
        improvementPlan: JSON.stringify(result.improvementPlan),
        updatedAt: new Date()
      }
    });

    revalidatePath(`/books/${bookId}/promise`);

    return {
      success: true,
      validation,
      result,
      message: "Score calculated successfully"
    };
  } catch (error) {
    console.error("[recalculateValidationScore] Error:", error);
    return {
      success: false,
      message: `Failed to calculate score: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// ============================================================================
// 5. VALIDATION SIDEBAR COMPONENT
// ============================================================================
// File: src/app/books/[slug]/promise/validation-sidebar.tsx

"use client";

import { useQuery } from "@tanstack/react-query";
import { BookValidation, ValidationPhase, ValidationDimension } from "@prisma/client";
import { useParams } from "next/navigation";

export function ValidationSidebar() {
  const params = useParams();
  const slug = params.slug as string;

  const { data: validation, isLoading } = useQuery<any>({
    queryKey: ["validation", slug],
    queryFn: async () => {
      const response = await fetch(`/api/validation/${slug}`);
      return response.json();
    }
  });

  if (isLoading) {
    return <div className="w-80 bg-gray-50 p-4">Loading validation...</div>;
  }

  if (!validation) {
    return <div className="w-80 bg-gray-50 p-4">No validation started</div>;
  }

  const scorePercentage = (validation.totalScore / 5.0) * 100;
  const statusColor =
    validation.totalScore >= 4.0 ? "text-green-600" :
    validation.totalScore >= 3.5 ? "text-amber-600" :
    validation.totalScore >= 3.0 ? "text-orange-600" :
    "text-red-600";

  return (
    <aside className="w-80 bg-gray-50 border-r border-gray-200 p-6 overflow-y-auto fixed right-0 top-0 bottom-0">
      {/* Score Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">VIABILITY SCORE</h3>

        <div className="mb-4">
          <div className={`text-4xl font-bold ${statusColor}`}>
            {validation.totalScore.toFixed(1)} / 5.0
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${scorePercentage}%` }}
              />
            </div>
            <span className="text-xs font-medium text-gray-600">{Math.round(scorePercentage)}%</span>
          </div>
        </div>

        <div className="text-xs text-gray-600 mb-4">
          Status: <span className="font-semibold">{validation.status}</span>
        </div>

        <div className="text-xs p-3 bg-blue-50 border border-blue-200 rounded text-blue-900">
          {validation.gateDecision === "proceed" && "✓ Can proceed to Outline"}
          {validation.gateDecision === "refine-first" && "⚠ Needs refinement (4-6 weeks)"}
          {validation.gateDecision === "archive" && "✗ Too risky, archive for now"}
        </div>
      </div>

      {/* Phase Progress */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">PHASES COMPLETE</h3>
        <div className="space-y-2">
          {validation.phases?.map((phase: ValidationPhase) => (
            <div key={phase.id} className="flex items-start gap-2 text-xs">
              <span className="text-lg">
                {phase.status === "complete" ? "✓" : phase.status === "in-progress" ? "⚠" : "⏳"}
              </span>
              <div className="flex-1">
                <div className="font-medium text-gray-900">{phase.phaseName}</div>
                {phase.score > 0 && (
                  <div className="text-gray-600">Score: {phase.score.toFixed(1)}/5</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button className="w-full px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded">
          View Full Report
        </button>
        <button className="w-full px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 rounded">
          Export PDF
        </button>
      </div>
    </aside>
  );
}

// ============================================================================
// 6. API ENDPOINT: GET VALIDATION STATUS
// ============================================================================
// File: src/app/api/validation/[slug]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateBookBySlug } from "@/lib/repositories/books";

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const book = await getOrCreateBookBySlug(params.slug);

    const validation = await prisma.bookValidation.findUnique({
      where: { bookId: book.id },
      include: {
        phases: {
          orderBy: { phaseNumber: "asc" }
        },
        dimensions: true
      }
    });

    if (!validation) {
      return NextResponse.json({
        bookId: book.id,
        status: "not-started",
        totalScore: 0,
        phases: [],
        dimensions: []
      });
    }

    return NextResponse.json(validation);
  } catch (error) {
    console.error("[GET /api/validation] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch validation" },
      { status: 500 }
    );
  }
}

// ============================================================================
// 7. GATE LOGIC: CHECK IF BOOK CAN PROCEED TO OUTLINE
// ============================================================================
// File: src/lib/validation/gate-logic.ts

export interface GateCheckResult {
  canProceed: boolean
  reason: string
  improvementPlan?: string[]
}

export async function checkOutlineGate(bookId: string): Promise<GateCheckResult> {
  const validation = await prisma.bookValidation.findUnique({
    where: { bookId },
    include: { dimensions: true }
  });

  if (!validation) {
    return {
      canProceed: false,
      reason: "Book has not completed market validation"
    };
  }

  if (validation.gateDecision === "proceed") {
    return {
      canProceed: true,
      reason: "Book passed validation (4.0+ score)"
    };
  }

  if (validation.gateDecision === "refine-first") {
    return {
      canProceed: false,
      reason: "Book needs refinement before outline (3.5-3.99 score)",
      improvementPlan: validation.improvementPlan ?
        JSON.parse(validation.improvementPlan) :
        undefined
    };
  }

  return {
    canProceed: false,
    reason: "Book failed validation (< 3.5 score). Archive and revisit in 6+ months."
  };
}

// ============================================================================
// INTEGRATION NOTES
// ============================================================================
/*
To integrate this validation system into GHOSTWRITR:

1. ADD DATABASE SCHEMA
   - Run: npx prisma migrate dev
   - Schema includes: ValidationPhase, ValidationDimension, BookValidation

2. ADD API ENDPOINTS
   - GET /api/validation/[slug] - Get validation status
   - POST /api/validation/[slug]/phase/[phaseNumber] - Save phase
   - PUT /api/validation/[slug]/calculate - Recalculate score

3. ADD COMPONENTS
   - ValidationSidebar component to Promise Stage
   - ValidationPhaseForm component
   - ScoresCard component
   - GateDecisionCard component

4. GATE CHECK IN OUTLINE STAGE
   - Before entering Outline, run: checkOutlineGate(bookId)
   - If canProceed === false, show warning/prevent entry

5. STYLING
   - Use existing Tailwind config
   - Colors: green-600 (4.0+), amber-600 (3.5-3.99), orange-600 (3.0-3.49), red-600 (<3.0)

6. STATE MANAGEMENT
   - Add validation state to book context
   - Cache validation data with React Query
   - Refetch on phase completion

7. TESTING
   - Test all 13 phases on LabFlow book
   - Verify score calculation accuracy
   - Verify gate logic prevents <3.5 books from proceeding
   - Test PDF export

8. LAUNCH CHECKLIST
   - [ ] All phases scoreable
   - [ ] Score calculation 100% accurate
   - [ ] Gate logic working
   - [ ] PDF export working
   - [ ] Mobile responsive
   - [ ] <2s load time
   - [ ] 0 books proceed with <3.5
*/
