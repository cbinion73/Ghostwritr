# GHOSTWRITR: Book Promise Master Document Generator

## System Context
You are building a feature for GHOSTWRITR, an AI-powered book writing platform. Your task is to create an interactive React application that compiles the Book Promise into a comprehensive, visually organized Master Document.

## Input Data Structure
The application will receive the following data (you can mock this for development):

```json
{
  "book": {
    "title": "string",
    "subtitle": "string",
    "promiseStatement": "string",
    "voiceBlend": {
      "persona1": { "name": "string", "weight": "number (0-100)" },
      "persona2": { "name": "string", "weight": "number (0-100)" },
      "persona3": { "name": "string", "weight": "number (0-100)" }
    },
    "storyFormat": "string (Hero Journey, Parable, Quest, etc.)",
    "wordCountTarget": "number",
    "trimSize": "string (e.g., 6x9 inches)"
  },
  "audience": {
    "summary": "string",
    "selectedUserTypes": ["string", "string", "string"]
  },
  "personas": [
    {
      "id": "string",
      "name": "string",
      "role": "string",
      "demographics": "string",
      "goals": ["string"],
      "painPoints": ["string"],
      "learningStyle": "string",
      "successMetric": "string"
    }
  ],
  "transformations": [
    {
      "personaId": "string",
      "personaName": "string",
      "stages": [
        {
          "stage": 1,
          "name": "Call",
          "description": "string"
        },
        {
          "stage": 2,
          "name": "Refusal",
          "description": "string"
        },
        // ... stages 3-7
      ]
    }
  ],
  "truths": [
    {
      "personaId": "string",
      "personaName": "string",
      "coreInsight": "string",
      "paradoxOrReframe": "string",
      "ahaMoment": "string"
    }
  ],
  "marketAnalysis": {
    "viabilityScore": "number (0-5)",
    "addressableMarket": "number",
    "competitivePositioning": "string",
    "competitors": [
      {
        "title": "string",
        "strength": "string",
        "weakness": "string"
      }
    ],
    "pricingStrategy": {
      "hardcover": "number",
      "paperback": "number",
      "ebook": "number",
      "rationale": "string"
    },
    "monetizationEcosystem": [
      {
        "channel": "string (Companion Workbook, Online Course, Speaking, Consulting, Blog)",
        "year1Revenue": "number",
        "potential": "string"
      }
    ],
    "riskAssessment": {
      "marketSaturation": "string (Low/Medium/High Risk)",
      "authorPlatform": "string",
      "economicSensitivity": "string",
      "overallRisk": "string"
    },
    "recommendation": "string (GO or NO-GO)"
  }
}
```

## Core Requirements

### 1. Document Structure (Single Artifact)
The Master Document should include sections in this order:

1. **Cover/Title Page**
   - Book title, subtitle
   - Author name
   - "Book Promise Master Document"
   - Date created

2. **Table of Contents**
   - Clickable/linked navigation to all sections
   - Page numbers (estimate pages for print format)

3. **Executive Summary (1 page)**
   - Promise statement
   - Key viability score
   - Go/No-Go recommendation
   - Next steps

4. **Section 1: Book Promise**
   - Promise statement (what reader gets)
   - Core promise in 2-3 sentences

5. **Section 2: Audience & Personas**
   - Audience research summary
   - User types selected
   - Full persona cards (3+ personas):
     * Name, role, demographics
     * Goals, pain points, learning style
     * Success metric
     * Visual persona card (with initials avatar)

6. **Section 3: Core Truths**
   - Truth articulated for each persona
   - Paradox/reframe for each
   - "Aha moment" that clicks

7. **Section 4: Transformation Journeys**
   - Hero Journey arc (or selected story format)
   - For each persona: all 7 stages with descriptions
   - Visual transformation arc diagram (persona journey visualized)

8. **Section 5: Market Opportunity**
   - Competitive landscape (3 competitors, strengths/weaknesses)
   - Market sizing (TAM, SAM, addressable market)
   - Trend momentum
   - Pricing strategy (hardcover, paperback, ebook with rationale)

9. **Section 6: Monetization Ecosystem**
   - All channels: Companion Workbook, Online Course, Speaking, Consulting, Blog
   - Year 1 revenue projections per channel
   - Total ecosystem potential
   - Visual: Monetization timeline/roadmap

10. **Section 7: Risk Assessment**
    - Market saturation risk
    - Author platform risk
    - Economic sensitivity
    - Overall risk profile
    - Mitigation strategies

11. **Section 8: Recommendations & Next Steps**
    - Go/No-Go recommendation with rationale
    - Top 3 priorities for moving to Outline stage
    - Key success metrics

12. **Appendix (Optional)**
    - Voice blend weights and rationale
    - Book setup parameters
    - Metadata (created date, status, version)

### 2. Visual Elements

**Required visualizations (embedded as charts/SVG):**

1. **Persona Card Layout**
   - Avatar (initials in colored circle)
   - Name, role, key stats
   - Goals, pain points in badge format

2. **Transformation Arc Diagram (per persona)**
   - Hero Journey stages (1-7) as nodes
   - Arrows showing progression
   - Brief stage description on hover/click
   - Color-coded by stage importance

3. **Market Positioning Quadrant**
   - X-axis: Academic ←→ Practical
   - Y-axis: Niche ←→ Broad
   - Place competitors and your book
   - Legend explaining positioning

4. **Monetization Timeline/Waterfall**
   - Channels: Book, Workbook, Course, Speaking, Consulting, Blog
   - Year 1, Year 2, Year 3 projections
   - Stacked bar chart or waterfall showing cumulative revenue

5. **Voice Blend Visualization**
   - Three overlapping circles (Venn diagram) OR
   - Pie chart showing persona weight distribution
   - Label with percentages and key characteristics

### 3. Approval & Segmentation Options

**User can approve sections independently:**
- After each major section (Promise, Audience, Truths, Transformations, Market, Monetization, Risk), display:
  - "✅ Approve This Section" button
  - "✏️ Request Changes" button (opens text input for feedback)
  - "🔄 Regenerate Section" button
  
- Approved sections lock (visual indicator: checkmark + subtle gray)
- Rejected sections remain editable and show user's feedback

- **Final Commit Button** (bottom of document):
  - Only becomes active when all sections are approved
  - Commits entire Book Promise to database
  - Triggers status change: DRAFT → COMMITTED
  - Routes to Outline Stage

### 4. Export Options

**Export menu (top right of document):**

1. **Export as PDF**
   - Professional formatting
   - Full visualization rendering
   - Table of contents with page numbers
   - Ready for printing or sharing

2. **Export as Markdown**
   - Clean, readable format
   - Preserves text, removes visualizations (or link to them)
   - Suitable for version control / archiving
   - Can be imported to other tools (Notion, Obsidian, etc.)

3. **Export as JSON**
   - Raw data structure
   - For importing into other systems
   - Hidden option (less visible)

4. **Export as HTML**
   - Standalone HTML file
   - All visualizations embedded as SVG
   - Can be opened in browser offline
   - Styled for readability

**Export UI:**
- Dropdown menu or modal
- Spinner during export
- Download confirmation
- Option to also send to email (optional)

### 5. UI/Design Requirements

**General:**
- Clean, professional layout (not flashy)
- Section numbering (Section 1, Section 2, etc.)
- Consistent typography (sans-serif for UI, serif for quotes)
- Generous whitespace
- Dark mode support (use CSS variables: `--color-text-primary`, `--color-background-primary`, etc.)

**Section Headers:**
- Large, bold, with light background bar
- Section number on left (muted color)
- Brief section description below title (13px, gray)

**Cards:**
- Persona cards, competitor cards, channel cards all use consistent styling
- Border: 0.5px solid border-tertiary
- Border-radius: 12px
- Padding: 1.25rem
- Hover: slight shadow or background change

**Approval UI:**
- Approval buttons at section end
- Status indicator (pending, approved, rejected)
- Feedback text visible if rejected
- Visual differentiation for locked sections

**Table of Contents:**
- Auto-generated from section headers
- Clickable (scroll-to-section or jump)
- Shows approval status for each section (✅, ⏳, ❌)

### 6. Interactive Elements

**Within the document:**
- Clicking persona names expands full persona details
- Hovering transformation stages shows deeper description
- Competitor cards expandable for full analysis
- Monetization timeline shows year-over-year projections on hover

**Conversational integration:**
- "Ask AI a question about this section" button (sends prompt via `sendPrompt()`)
- Examples: "Tell me why we positioned against X competitor this way" or "Should we adjust Year 1 revenue assumptions?"

### 7. Data Mocking (for development)

If real data isn't available, generate plausible mock data for:
- A book about lab management + clarity in decision-making
- 3 personas: Sarah (Lab Manager), Marcus (Ops Director), Lisa (Founder)
- Hero Journey transformation structure
- Market analysis with 3 competitors
- Monetization across 5 channels
- Viability score 4.2/5, GO recommendation

## Technical Requirements

- **Framework:** React (functional components + hooks)
- **Styling:** Tailwind CSS core utilities only (no custom plugins)
- **Charts/Visualizations:** Use Recharts for bar/line charts, SVG for custom diagrams
- **Export:** Use jsPDF for PDF export, papaparse or native JSON for data exports
- **Responsive:** Works on desktop, tablet, mobile (document scrolls vertically, sections stack)
- **Accessibility:** Semantic HTML, ARIA labels where needed, color contrast compliance

## User Workflow

1. **Load Document** → System fetches Book Promise data
2. **Read Sections** → Scroll through, interact with visualizations
3. **Approve/Revise** → Click approval buttons per section
4. **Ask Questions** → Chat with AI about specific sections
5. **Export** → Download PDF, Markdown, or HTML
6. **Commit** → Final button commits all approved sections to database
7. **Route** → Navigate to Outline Stage

## Success Criteria

✅ Document displays all sections clearly
✅ Visualizations render correctly (personas, transformations, market positioning, monetization)
✅ Approval workflow works (sections lock when approved)
✅ Exports generate correctly (PDF readable, Markdown clean, JSON valid)
✅ Responsive on mobile, tablet, desktop
✅ Dark mode supported
✅ AI chat integration allows follow-ups
✅ Professional, polished appearance (not generic)
✅ Performance: Document loads in <2s, exports in <5s

## Deliverable

Return a single React component (default export) that:
1. Accepts book promise data as props OR loads from mocked data
2. Renders the complete Master Document with all sections, visualizations, and approval UI
3. Handles exports (PDF, Markdown, JSON, HTML)
4. Integrates conversational refinement (`sendPrompt()`)
5. Is production-ready (clean code, no console errors, accessibility compliant)

---

**Ready to build?** Start with the structure and core sections, then add visualizations and export functionality.
