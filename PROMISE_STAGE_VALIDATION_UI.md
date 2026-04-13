# GHOSTWRITR PROMISE STAGE: VALIDATION UI IMPLEMENTATION
## Integrating 13-Phase Market Viability Framework into the Platform

**Objective:** Add market validation as a mandatory workflow to Promise Stage before books advance to Outline

**Scope:** UI/UX design, component architecture, data structures, scoring logic

---

## CURRENT PROMISE STAGE ARCHITECTURE

### Existing Components
- Promise statement textbox
- 3 validation dashboards (Persona Match, Market Viability, Promise Quality)
- Refinement chat interface
- Buttons: Validate, Refine, Save

### What's Missing
- 13-phase validation checklist
- Phase-by-phase data collection
- Research guidance
- Score calculation and tracking
- Go/no-go gate logic
- Validation artifact generation

---

## NEW VALIDATION UI STRUCTURE

### Left Sidebar: Validation Progress

```
┌─────────────────────────────────┐
│ MARKET VIABILITY VALIDATION     │
│                                 │
│ Score: 3.6/5 (Needs Refinement) │
│ ████████░░░░░░░░░░░░░░ 72%     │
│                                 │
│ PHASES COMPLETE:                │
│ Phase 1-2: Problem ✓            │
│ Phase 2-3: Audience ✓           │
│ Phase 3-4: Competitive ✓        │
│ Phase 4: Differentiation ⚠      │
│ Phase 5: Usability ⚠            │
│ Phase 6: Completion ⚠           │
│ Phase 7: Shareability ⚠         │
│ Phase 8: Timing ✓               │
│ Phase 9: Commercial ✓           │
│ Phase 10: Credibility ⏳        │
│ Phase 11: Synthesis ⏳          │
│ Phase 12: Verdict ⏳            │
│ Phase 13: Improvements ⏳       │
│                                 │
│ [View Full Report]              │
│ [Export PDF]                    │
└─────────────────────────────────┘
```

### Main Content Area: Current Phase

```
┌──────────────────────────────────────────────────┐
│                                                  │
│ PHASE 4: DIFFERENTIATION ANALYSIS               │
│                                                  │
│ Status: IN PROGRESS (Week 3)                    │
│ Estimated time: 1-2 weeks                       │
│                                                  │
│ ─────────────────────────────────────────────   │
│                                                  │
│ 4.1 Current Promise vs. Competitors             │
│                                                  │
│ Our Promise:                                    │
│ [Text area - auto-populated from Promise Brief]│
│                                                  │
│ Competitor 1: Labwork to Leadership             │
│ [Text area - auto-populated from research]     │
│                                                  │
│ Competitor 2: Lab Dynamics                      │
│ [Text area]                                     │
│                                                  │
│ ─────────────────────────────────────────────   │
│                                                  │
│ 4.2 Differentiation Statement                   │
│                                                  │
│ "Unlike [competitors], we [unique thing]"      │
│                                                  │
│ [Text area - user enters differentiation]      │
│                                                  │
│ ℹ️ Tip: Can reader explain this in one         │
│    sentence to a peer?                          │
│                                                  │
│ ─────────────────────────────────────────────   │
│                                                  │
│ 4.3 Differentiation Score                       │
│                                                  │
│ ○ 5/5 - Clear, defensible, meaningful          │
│ ● 3/5 - Some difference but not obvious         │
│ ○ 1/5 - Seems like repackaging                  │
│                                                  │
│ Current Score: 3/5                              │
│                                                  │
│ [Next Phase] [Save Progress] [Get Help]         │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## DETAILED COMPONENT ARCHITECTURE

### 1. Validation Sidebar Component

**Location:** Left of main Promise Stage  
**Height:** Full viewport  
**Width:** 300px

**Sections:**

#### A. Score Summary Card
```
┌─────────────────────────┐
│ VIABILITY SCORE         │
│                         │
│ 3.6 / 5.0              │
│ ████████░░░ 72%        │
│                         │
│ Status: Needs Refinement│
│                         │
│ Gate: Cannot proceed    │
│       (< 3.5)          │
│                         │
│ [Unlock at 3.5+]       │
└─────────────────────────┘
```

**Data:**
- Current score (calculated)
- Target score (4.0+ for proceed)
- Status interpretation
- Gate status (locked/unlocked)

#### B. Phase Progress List
```
PHASES: 13 Total

✓ Phase 1-2: Problem (Week 1)
   Score: 4.5/5 [View]

✓ Phase 2-3: Audience (Week 2)
   Score: 4.0/5 [View]

✓ Phase 3-4: Competition (Week 2-3)
   Score: 3.5/5 [View]

⚠ Phase 4: Differentiation (Week 3)
   Score: 2.5/5 [View] ← CURRENT
   Status: Critical weakness

⏳ Phase 5: Usability (Week 4)
   Not started
   
[Collapse completed phases]
[View all scores]
```

**Click behavior:**
- Click phase name → Scroll to that phase
- Click score → Show detailed breakdown
- Click [View] → Expand phase details

#### C. Action Buttons
```
[Continue to Next Phase]
[View Full Report]
[Export as PDF]
[Reset Validation]
[Get Help]
```

---

### 2. Main Content: Phase Interface

**For each of 13 phases:**

#### Header
```
PHASE X: [Phase Name]
Status: [IN PROGRESS / PENDING / COMPLETE]
Time Estimate: [X weeks]
Gate Requirement: [Score must be 3.5+]
```

#### Body: Phase Steps

Each phase has 2-4 steps. Example from Phase 4:

```
4.1 - Current Promise vs. Competitors

[Description of what this section tests]

YOUR PROMISE STATEMENT:
[Auto-populated from Promise Brief]

COMPETITOR 1: Labwork to Leadership
Promise: [Auto-populated from research database]

COMPETITOR 2: Lab Dynamics  
Promise: [Auto-populated]

[Add more competitors: +]

---

4.2 - Differentiation Statement

Instructions:
Write your differentiation in the format:
"Unlike [competitors who promise X], we [specific unique thing]"

Example:
❌ "Unlike generic leadership books, we provide frameworks"
   (Too broad, they do too)

✓ "Unlike books that teach soft skills, we restructure lab 
   operations so delegation actually works through systematic 
   decision authority and workflow automation."
   (Specific, different, meaningful)

[Text area - user enters]

Can a reader immediately explain why this is different?
○ Yes, clearly
○ Somewhat  
○ No, still vague

---

4.3 - Differentiation Score

Select your score:
○ 5/5 - Clear, defensible, meaningful difference
○ 4/5 - Good difference, easily explained
○ 3/5 - Some difference but not obvious
○ 2/5 - Weak or seems like repackaging
○ 1/5 - No real differentiation

Current Score: [Will calculate average if multiple assessments]

[Save Score]
```

#### Footer
```
[←← Previous Phase] [Next Phase ►►]
[Save & Continue Later] [Skip to Summary]
```

---

### 3. Research Database Integration

**Available for each phase:**

#### Auto-Populated Research
```
RESEARCH MATERIALS FOR THIS PHASE:
(Auto-populated from web research)

📚 Comparable Books Found:
- "Labwork to Leadership" (Harvard, 2025)
  Rating: 4.8/5 (127 reviews)
  Amazon Link
  
- "Lab Dynamics" (Cold Spring Harbor, 2023)
  Rating: 4.2/5 (89 reviews)
  Amazon Link

📊 Market Reports:
- Lab Management Training Market Growth (2024)
  Size: $500M+, Growth: 8-12%/year
  Source: Industry Report
  
- Burnout in Academic Research (Nature, 2025)
  Key finding: Time poverty is #2 factor
  Read Full Article

🔗 Supporting Research:
- [Link to relevant academic paper]
- [Link to market analysis]
- [Link to case study]
```

#### User-Added Research
```
ADD YOUR OWN RESEARCH:

[Paste URL]  [Add Source]

OR

[Add text/notes directly]

Recent sources you've added:
- [Source 1] - added yesterday
- [Source 2] - added 3 days ago
```

---

### 4. Scoring Dashboard

**Real-time calculation:**

```
DIMENSION BREAKDOWN:

Dimension                Current  Weight  Contribution
────────────────────────────────────────────────────
1. Problem Validation     4.5/5    15%     0.68
2. Audience Clarity       4.0/5    10%     0.40
3. Accessibility          3.5/5    10%     0.35
4. Competition            3.5/5    15%     0.53
5. Differentiation        2.5/5    15%     0.38 ← BOTTLENECK
6. Usability              2.5/5    12%     0.30 ← BOTTLENECK
7. Completion             2.5/5    10%     0.25 ← BOTTLENECK
8. Shareability           2.0/5     5%     0.10 ← BOTTLENECK
9. Timing & Trends        4.5/5     5%     0.23
10. Commercial            3.5/5     5%     0.18
11. Author Credibility    ?/5       8%     [PENDING]
────────────────────────────────────────────────────
TOTAL SCORE:                              3.60 / 5.0

Status: NEEDS REFINEMENT (3.5-3.99)

WHAT THIS MEANS:
This book has strong foundations but critical gaps.
Problems identified: 4
Estimated fix time: 4-6 weeks
Expected score after improvements: 4.2/5

[View Improvement Plan]
```

**Color Coding:**
- 4.0+ → 🟢 Green (Strong)
- 3.5-3.99 → 🟡 Yellow (Needs work)
- 3.0-3.49 → 🟠 Orange (Risky)
- <3.0 → 🔴 Red (Critical)

---

### 5. Gate Logic

**After Phase 12 (Synthesis):**

```
VIABILITY SCORE: 3.60 / 5.0

Can this book proceed to Outline?

┌─ SCORE 4.0+ ────────────────────┐
│ ✓ YES, PROCEED                  │
│                                 │
│ [Unlock Outline Stage]          │
│ [Generate Final Report]         │
└─────────────────────────────────┘

┌─ SCORE 3.5-3.99 ────────────────┐
│ ⚠ CONDITIONAL PROCEED           │
│                                 │
│ Status: Can refine, then proceed│
│                                 │
│ Critical Issues to Fix:         │
│ • Differentiation (2.5/5)       │
│ • Usability (2.5/5)             │
│ • Completion (2.5/5)            │
│ • Shareability (2.0/5)          │
│                                 │
│ Estimated refinement time: 4-6w │
│ Expected score after: 4.2/5     │
│                                 │
│ [View Improvement Plan]         │
│ [Start Refinement]              │
│ [Skip to Outline Anyway]        │
│   (⚠ Not recommended)           │
└─────────────────────────────────┘

┌─ SCORE <3.5 ─────────────────────┐
│ ✗ DO NOT PROCEED                 │
│                                  │
│ Status: ARCHIVE (revisit later)  │
│                                  │
│ Reasons:                         │
│ • Problem unclear (score: X)     │
│ • Market too competitive (score) │
│ • Differentiation too weak       │
│                                  │
│ Next Steps:                      │
│ 1. Review weaknesses             │
│ 2. Fundamentally rework concept  │
│ 3. Return to validation in 6mo   │
│                                  │
│ [Archive Book]                   │
│ [Save for Later Review]          │
└────────────────────────────────────┘
```

---

### 6. Final Report Generation

**After user completes validation:**

```
┌────────────────────────────────────────┐
│ MARKET VIABILITY ANALYSIS              │
│ [Book Title]                           │
│                                        │
│ Generated: April 11, 2026              │
│ Score: 3.6/5 (Needs Refinement)       │
│                                        │
│ [View as PDF]                          │
│ [Export to PDF]                        │
│ [Share with team]                      │
│ [Print]                                │
│                                        │
│ Report includes:                       │
│ • Detailed scoring for all 11 dims    │
│ • Evidence for each score             │
│ • Competitive analysis                │
│ • Market size estimation              │
│ • Go/no-go recommendation             │
│ • Critical improvements needed         │
│ • 4-6 week refinement plan            │
│                                        │
│ 30+ pages when exported                │
└────────────────────────────────────────┘
```

---

## DATA STRUCTURES

### ValidationPhase Schema
```typescript
interface ValidationPhase {
  id: string // "phase-1-2"
  name: string // "Problem Validation"
  week: string // "Week 1"
  estimatedDays: number
  status: "not-started" | "in-progress" | "complete"
  gateRequirement?: {
    dimensionId: string
    minimumScore: number
  }
  steps: ValidationStep[]
  score: number // 1-5
  evidence: string[] // Sources used
  completedAt?: Date
}

interface ValidationStep {
  id: string // "4.1"
  title: string // "Current Promise vs. Competitors"
  instructions: string
  inputType: "text" | "select" | "textarea" | "score"
  responses: {
    userInput: string
    sources: string[] // URLs/references
    timestamp: Date
  }
  guidance: string // Tips/examples
}

interface ValidationScore {
  dimension: string // "Differentiation"
  score: number // 1-5
  weight: number // 0.15
  evidence: string[]
  gateStatus: "pass" | "fail" | "pending"
  improvementPlan?: string
  updatedAt: Date
}

interface BookValidation {
  bookId: string
  stages: ValidationPhase[]
  totalScore: number
  status: "not-started" | "in-progress" | "complete"
  dimensions: ValidationScore[]
  gateDecision: "proceed" | "refine-first" | "archive"
  startedAt: Date
  completedAt?: Date
}
```

---

## UI WORKFLOW

### User Journey

```
1. USER ENTERS PROMISE STAGE
   ↓
2. SYSTEM CHECKS: Has validation been run?
   ├─ YES → Show validation sidebar + current phase
   └─ NO → Offer: "Start Validation" button
   ↓
3. USER CLICKS "START VALIDATION"
   ↓
4. SYSTEM LOADS PHASE 1-2: PROBLEM VALIDATION
   ├─ Auto-populate: Promise statement, current problem
   ├─ Show: Research database (comparable books, market reports)
   ├─ Request: User input (frequency, severity, evidence)
   ├─ Calculate: Problem score (1-5)
   ↓
5. USER COMPLETES PHASE
   ├─ System saves responses
   ├─ System checks gate (score > threshold?)
   ├─ System calculates running total score
   ├─ System shows: Which phases to do next
   ↓
6. USER PROGRESSES THROUGH PHASES 1-13 (6 weeks)
   ├─ Can work on any phase (not sequential)
   ├─ Progress tracked in sidebar
   ├─ Running score updates in real-time
   ↓
7. ALL PHASES COMPLETE
   ├─ System calculates final score
   ├─ System applies gate logic
   ├─ System generates full report
   ├─ System makes recommendation
   ↓
8. GATE DECISION
   ├─ 4.0+  → Unlock Outline stage
   ├─ 3.5-3.99 → Show improvement plan, allow conditional proceed
   └─ <3.5 → Archive book, recommend revisit in 6 months
```

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Backend (Week 1)

**Database:**
- [ ] Create ValidationPhase table
- [ ] Create ValidationScore table
- [ ] Create ValidationStep table
- [ ] Create BookValidation table
- [ ] Add validation_status column to Book table

**API Endpoints:**
- [ ] GET /api/validation/:bookId → Get validation progress
- [ ] POST /api/validation/:bookId/phase/:phaseId → Save phase response
- [ ] PUT /api/validation/:bookId/score → Update dimension score
- [ ] POST /api/validation/:bookId/calculate → Trigger score calculation
- [ ] GET /api/validation/:bookId/report → Generate report

**Scoring Logic:**
- [ ] Implement dimension scoring function
- [ ] Implement weighted average calculation
- [ ] Implement gate logic (proceed/refine/archive)
- [ ] Implement improvement plan generator

### Phase 2: Frontend (Week 2)

**Components:**
- [ ] ValidationSidebar component
- [ ] ValidationPhase component
- [ ] PhaseStep component
- [ ] ScoreSelector component
- [ ] ResearchDatabase component
- [ ] GateDecision component

**State Management:**
- [ ] Add validation state to book context
- [ ] Add phase progress tracking
- [ ] Add score caching
- [ ] Add unsaved changes detection

**UI/UX:**
- [ ] Sidebar styling and responsiveness
- [ ] Phase navigation (next/previous)
- [ ] Progress visualization (progress bar)
- [ ] Color coding (red/orange/yellow/green)
- [ ] Responsive layout (mobile, tablet, desktop)

### Phase 3: Integration (Week 3)

**Promise Stage Changes:**
- [ ] Add ValidationSidebar to Promise Stage layout
- [ ] Reposition main content (narrow for sidebar)
- [ ] Add "Start Validation" button
- [ ] Integrate with existing Refine interface
- [ ] Update Promise workflow to check validation before Outline

**Outline Stage Changes:**
- [ ] Add gate check: Can only enter if score 3.5+
- [ ] Auto-populate audience/positioning from validation
- [ ] Show viability scorecard in Outline

**Research Stage Changes:**
- [ ] Link to validation-identified gaps
- [ ] Show which research is needed to improve scores

### Phase 4: Features (Week 4)

**Reporting:**
- [ ] PDF export of full validation report
- [ ] Summary card for team sharing
- [ ] Email report to user
- [ ] Save report to artifacts

**Advanced:**
- [ ] Improvement plan generation (automatically suggest fixes)
- [ ] Benchmarking (compare this book to others)
- [ ] Recurring validation (re-run after improvements)
- [ ] Research database expansion (auto-update competitive landscape)

---

## DESIGN MOCKUP COORDINATES

### Layout (1920px width)

```
[Sidebar: 300px] [Main: 1620px]

Sidebar: Fixed left, full height, scroll
Main: Scrollable content area
```

### Color Scheme

```
Green (4.0+):     #10b981
Yellow (3.5-3.99): #f59e0b
Orange (3.0-3.49): #ef6923
Red (<3.0):        #ef4444
Blue (links):      #3b82f6
Gray (disabled):   #9ca3af
```

### Typography

```
Headers: System font, 24px, bold (Phase name)
Subheaders: System font, 18px, semibold (Step name)
Body: System font, 16px, regular (Instructions)
Small: System font, 14px, regular (Helper text)
Score: System font, 48px, bold (Big number)
```

---

## INTEGRATION WITH EXISTING GHOSTWRITR SYSTEMS

### Promise Brief
- Validation pulls current promise statement
- Validation updates validated promise statement
- Auto-sync between Promise Brief and validation

### Persona Pack
- Validation scores personas
- Feeds into Persona Match dashboard
- Validation includes persona feedback

### Market Research
- Validation uses Gemini research results
- Feeds competitive landscape back to research
- Gemini can power improvement suggestions

### Outline Stage
- Cannot enter if validation < 3.5
- Validation scorecard visible in Outline
- Outline structure informed by validation findings

---

## SUCCESS CRITERIA

**Launch Readiness:**
- [ ] All 13 phases scoreable in UI
- [ ] Score calculation 100% accurate
- [ ] Gate logic prevents <3.5 books from proceeding
- [ ] Full report generates correctly
- [ ] Works on mobile, tablet, desktop
- [ ] Performance: <2s load time for validation sidebar

**User Adoption:**
- [ ] 100% of new books go through validation
- [ ] Average validation completion: 6-8 weeks
- [ ] User satisfaction: 4.0+/5.0
- [ ] No books proceed to Outline with <3.5 score
- [ ] 70% of books score 3.5+ (healthy distribution)

---

## TECHNICAL DEPENDENCIES

- Next.js 16+ (existing)
- TypeScript (existing)
- Prisma (existing database)
- Tailwind CSS (existing)
- React Context (state management)
- PDF.js (for report export)
- Gemini API (for research integration)

---

## TIMELINE TO LAUNCH

**Week 1:** Backend setup (database, APIs, scoring logic)  
**Week 2:** Frontend components (sidebar, phases, score selector)  
**Week 3:** Integration (Promise Stage, Outline gate, workflows)  
**Week 4:** Features (reporting, improvements, polish)  
**Week 5:** Testing, bug fixes, optimization  
**Week 6:** Launch

**Total: 6 weeks to full implementation**

---

## SUCCESS OUTCOME

Every GHOSTWRITR book will be:
- ✓ Validated against 11 market dimensions
- ✓ Gated at 3.5+ viability score
- ✓ Informed by market evidence (not hunches)
- ✓ Positioned with clear differentiation
- ✓ Structured for high completion/recommendation
- ✓ Documented with comprehensive market analysis

**Result:** Books that get written are books that will actually sell.
