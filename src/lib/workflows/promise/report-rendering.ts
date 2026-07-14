import type { BookSetupProfile } from "../../book-setup-types";
import type {
  CoreTruthsArtifact,
  AudienceResearchArtifact,
  MarketReport,
  PositioningRecommendations,
  PromiseBrief,
  TitleSubtitleFinalization,
  TransformationArtifact,
} from "../../promise-types";
import type { PitchAudienceProfile } from "./report-presentation";
import {
  renderMarkdownBulletList,
  renderMarkdownNumberedList,
  summarizeVoiceBlendForPitch,
} from "./report-presentation";

export type BookPitchExecutiveBookVisionParams = {
  title: string;
  subtitle: string;
  conceptStatement: string;
  corePromise: string;
  targetAudience: string;
  marketOpportunity: string;
  authorCredibility: string;
  executiveSummary: string;
  recommendation: "GO" | "NO_GO" | "CONDITIONAL_GO";
  rationale: string;
  nextSteps: string[];
  audienceProfiles: PitchAudienceProfile[];
  audienceResearch?: AudienceResearchArtifact;
  promise: PromiseBrief;
  coreTruths?: CoreTruthsArtifact;
  transformationArc?: TransformationArtifact;
  marketReport: MarketReport;
  recommendations: PositioningRecommendations;
  bookSetupProfile?: BookSetupProfile | null;
  titleSubtitleFinalization?: TitleSubtitleFinalization;
};

export function renderBookPitchExecutiveSummaryAndBookVision(
  params: BookPitchExecutiveBookVisionParams,
): string {
  const audienceProfiles = params.audienceProfiles.slice(0, 3);
  const stage1Me = params.transformationArc?.arc.stage1Me;
  const stage2We = params.transformationArc?.arc.stage2We;
  const stage3Truth = params.transformationArc?.arc.stage3Truth;
  const stage4You = params.transformationArc?.arc.stage4You;
  const stage5FinalWe = params.transformationArc?.arc.stage5FinalWe;

  return `# EXECUTIVE SUMMARY

### Concept Statement

**Title:** ${params.title}

**Subtitle:** ${params.subtitle}

**One-sentence concept:** ${params.conceptStatement}

**Core promise:** ${params.corePromise}

**Target audience:** ${params.targetAudience}

**Market opportunity:** ${params.marketOpportunity}

**Author credibility:** ${params.authorCredibility}

### The Problem

**Problem statement:** ${params.promise.readerProblem || stage2We?.sharedProblem || "The reader is accountable for results, but lacks a reliable operating model for diagnosing what is actually breaking down."}

**Urgency level:** ${params.marketReport.audienceDemand.personaUrgency[0]?.urgency || "High"}

**Why unsolved:** ${params.marketReport.commercialRisks[0] || "Most competing solutions treat symptoms or assume a reader context that does not match this audience."}

**Current approach:** ${params.marketReport.audienceDemand.searchBehavior[0] || "Readers are piecing together tactics, frameworks, and advice without a unifying model."}

### The Solution

**Core truth/framework:** ${params.coreTruths?.completeTruth || params.promise.coreTruth || params.promise.bigIdea}

**How it's different:** ${params.recommendations.bookStrategy.differentiationStrategy}

**Author advantage:** ${params.authorCredibility}

### Target Audience

**Primary persona/segment:** ${audienceProfiles[0]?.label || params.targetAudience}

**Secondary personas/segments:** ${(audienceProfiles.slice(1).map((profile) => profile.label).join("; ") || "Secondary audience still being refined.")}

**Market sizing:** TAM: ${params.marketReport.marketSizing.totalAddressableMarket} | SAM: ${params.marketReport.marketSizing.serviceableAddressableMarket} | SOM Year 1: ${params.marketReport.marketSizing.serviceableObtainableMarket}

### Market Position

**Competitive landscape:** ${params.marketReport.saturationAssessment}

**Your differentiation:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.differentiation}

**White space:** ${params.marketReport.competitiveLandscape.marketPositioning.whiteSpace}

### Business Case

**Book price:** ${params.marketReport.pricingStrategy.pricingTiers[0]?.pricePoint || "To be finalized"}

**Year 1 projection:** ${params.marketReport.marketSizing.serviceableObtainableMarket}

**Year 1 revenue:** ${params.marketReport.financialProjections.yearOneRevenue}

**Ecosystem potential:** ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection}

**Break-even:** ${params.recommendations.financialRecommendations.profitabilityTimeline}

### Launch Plan

**Publishing path:** ${params.recommendations.launchAndGoToMarket.publishingPathRecommendation}

**Launch date:** ${params.recommendations.launchAndGoToMarket.launchTimeline}

**Marketing strategy:** ${params.recommendations.launchAndGoToMarket.distributionChannelPriorities.join("; ")}

**Key milestones:** ${params.recommendations.teamAndResources.timelineAndMilestones.join("; ")}

### Final Recommendation

**Recommendation:** ${params.recommendation.replace(/_/g, " ")}

**Rationale:** ${params.rationale}

**Next steps:** ${params.nextSteps.join("; ")}

### Executive Summary Narrative

${params.executiveSummary}

# SECTION 1: BOOK VISION

**Title:** ${params.title}

**Subtitle:** ${params.subtitle}

**Rationale:** ${params.titleSubtitleFinalization?.titleRationale || params.recommendations.bookStrategy.coreMessagePositioning}

### Core Concept

**One sentence:** ${params.conceptStatement}

**One paragraph:** ${params.executiveSummary}

### Core Promise

**What reader gets:** ${params.corePromise}

**How they'll feel:** ${params.promise.readerDesire || stage5FinalWe?.identityShift || "More confident, less reactive, and more in control of the real problem."}

**What becomes possible:** ${stage5FinalWe?.collectiveVision || params.promise.transformationAfter}

### Core Truth / Framework

**Core concept:** ${params.promise.bigIdea || params.conceptStatement}

**Central insight:** ${params.coreTruths?.coreInsight.coreTruth || params.promise.coreTruth || params.promise.bigIdea}

**The paradox:** ${params.coreTruths?.paradox.whatMakesThisSurprising || stage3Truth?.paradox || "The fix is not more intensity; it is better diagnosis and more consistent execution."}

**Why it matters:** ${params.coreTruths?.stakes.ifEmbraced || stage3Truth?.ifEmbraced || params.promise.stakes}

### Narrative Structure (ME-WE-TRUTH-YOU-WE)

**ME - Personal Dilemma:** ${stage1Me?.personalDilemma || "Open with the author's real collision with the problem and the cost of solving it the wrong way."}

**WE - Common Ground:** ${stage2We?.sharedProblem || params.promise.readerProblem}

**TRUTH - Core Insight:** ${stage3Truth?.coreTruth || params.coreTruths?.completeTruth || params.promise.coreTruth}

**YOU - Application:** ${stage4You?.firstAction || params.promise.bigIdea}

**WE - Vision:** ${stage5FinalWe?.collectiveVision || params.promise.transformationAfter}

### Voice & Tone

**Voice & tone:** ${summarizeVoiceBlendForPitch(params.bookSetupProfile)}

**What makes it distinctive:** ${params.recommendations.bookStrategy.voiceAndToneRecommendations}

### Reader Journey

**Starting point:** ${params.promise.transformationBefore || stage1Me?.manifestation || "Readers begin overextended, under-language-equipped, and overly dependent on their own effort."}

**Transformation:** ${params.transformationArc?.arc.completeTransformation || params.promise.transformationAfter}

**Ending point:** ${params.promise.transformationAfter || stage5FinalWe?.identityShift || "Readers end with a more portable model, clearer decisions, and greater authority under pressure."}`;
}

export type BookPitchAudienceTransformationParams = Pick<
  BookPitchExecutiveBookVisionParams,
  | "targetAudience"
  | "audienceProfiles"
  | "audienceResearch"
  | "promise"
  | "coreTruths"
  | "transformationArc"
  | "marketReport"
  | "recommendations"
>;

export function renderBookPitchAudienceAndTransformation(
  params: BookPitchAudienceTransformationParams,
): string {
  const audienceProfiles = params.audienceProfiles.slice(0, 3);
  const audienceComparison = params.audienceResearch?.phase3;
  const audienceOverview = renderMarkdownBulletList(
    audienceProfiles.map(
      (profile) =>
        `${profile.label}: ${profile.description} | ${profile.roleContext}`,
    ),
    params.targetAudience,
  );
  const sharedThemes = renderMarkdownBulletList(
    audienceComparison?.commonThemes ?? [],
    "The audience segments share a need for a clearer operating model, stronger execution, and proof that the framework works in the real world.",
  );
  const crossPersonaDifferences = renderMarkdownBulletList(
    (audienceComparison?.differences ?? []).map(
      (difference) => `${difference.persona}: ${difference.difference}`,
    ),
    "Each audience segment experiences the problem at a different altitude, which means the book must show multiple entry points into the same truth.",
  );
  const objectionLines = audienceProfiles
    .map(
      (profile, index) => `**Objection ${index + 1}:** ${profile.label} may worry that the book is too abstract for the urgency of their situation.
- **Response:** ${profile.whyThisBook}`,
    )
    .join("\n\n");
  const stage1Me = params.transformationArc?.arc.stage1Me;
  const stage2We = params.transformationArc?.arc.stage2We;
  const stage3Truth = params.transformationArc?.arc.stage3Truth;
  const stage4You = params.transformationArc?.arc.stage4You;
  const stage5FinalWe = params.transformationArc?.arc.stage5FinalWe;
  const stage6Patterns = params.transformationArc?.arc.stage6Patterns;
  const stage7BookMap = params.transformationArc?.arc.stage7BookMap;

  return `# SECTION 2: AUDIENCE & PERSONAS

**Primary market:** ${params.targetAudience}

**Secondary markets:** ${(audienceProfiles.slice(1).map((profile) => profile.label).join("; ") || "Secondary markets still being refined")}

**Market size:** TAM: ${params.marketReport.marketSizing.totalAddressableMarket} | SAM: ${params.marketReport.marketSizing.serviceableAddressableMarket}

**Problem urgency:** ${params.marketReport.audienceDemand.personaUrgency.map((item) => `${item.personaName || "Audience"}: ${item.urgency}`).join("; ")}

### Target Audience Overview

${audienceOverview}

${audienceProfiles
  .map(
    (profile, index) => `### Persona ${index + 1}: ${profile.label}

**Role/Title:** ${profile.label}

**Demographics / Context:** ${profile.roleContext}

**Primary pain point:** ${profile.primaryPainPoint}

**Goals:**
${renderMarkdownBulletList(profile.keySignals, "Clarify priorities, improve decisions, and create durable progress.")}

**Objections:** ${params.recommendations.personaStrategies[index]?.priceSensitivity || "They may worry the book is too conceptual, too generic, or not built for their operating context."}

**Success metric:** ${params.recommendations.personaStrategies[index]?.launchStrategy || "They can use the framework in real conditions and see better results quickly."}

**Why this book:** ${profile.whyThisBook}

**Voice blend resonance:** ${profile.voiceBlendResonance}`,
  )
  .join("\n\n")}

### Persona Comparison

**What's universal:**
${sharedThemes}

**What's different:**
${crossPersonaDifferences}

**How book serves all:** ${stage7BookMap?.implicitPersonaService || "The book serves all segments by telling stories and offering frameworks that different readers can map onto their own roles without being explicitly named in the manuscript."}

### Reader Objections & Responses

${objectionLines}

# SECTION 3: TRANSFORMATION JOURNEY

### The Universal Arc (8 Stages)

**STAGE 1: FALSE BELIEF / CURRENT STATE**

${stage1Me?.falseBelief || params.promise.transformationBefore || "Readers start by assuming more effort inside the same mental model will solve the problem."}

**STAGE 2: FRICTION / AWAKENING**

${stage2We?.sharedProblem || params.promise.readerProblem || "The current approach keeps producing friction, rework, and unclear ownership."}

**STAGE 3: RECOGNITION / ADMISSION**

${stage2We?.readerQuestion || "Readers admit that the problem is deeper than the surface symptoms they have been reacting to."}

**STAGE 4: RESISTANCE / DOUBT**

${stage4You?.applicationResistance || "The new approach initially feels slower or riskier than the old habit, even if the old habit is failing."}

**STAGE 5: ENCOUNTERING THE NEW TRUTH**

${stage3Truth?.reframe || params.coreTruths?.completeTruth || params.promise.coreTruth}

**STAGE 6: EXPERIMENTATION / APPLICATION**

${stage4You?.firstAction || params.promise.bigIdea || "Readers test the truth through a concrete first move in their own operating environment."}

**STAGE 7: BREAKTHROUGH / EVIDENCE**

${stage5FinalWe?.transformedSuccess || "Readers see evidence that the new model changes behavior, clarity, and results under pressure."}

**STAGE 8: INTEGRATION / NEW NORMAL**

${stage5FinalWe?.identityShift || params.promise.transformationAfter || "The truth becomes part of how they lead, decide, and interpret friction going forward."}

### How Each Persona Experiences the Arc

${audienceProfiles
  .map(
    (profile) => `**${profile.label}:** ${profile.primaryPainPoint} -> ${profile.whyThisBook}`,
  )
  .join("\n\n")}

### Key Turning Points in Book

**Where does awakening happen?** ${stage7BookMap?.sharedDilemmaReveal || "Early in the book, when readers see that the author's struggle is structurally the same as their own."}

**Where does resistance get addressed?** ${stage4You?.applicationResistance || "In the application chapters, where the reader feels the temptation to fall back to the old model."}

**Where does the truth reveal?** ${stage7BookMap?.truthReveal || "After the shared problem is fully named and the reader is emotionally ready for a reframe."}

**Where does breakthrough occur?** ${stage5FinalWe?.transformedSuccess || "When readers see the framework produce better outcomes in a real-world scenario."}

### Implicit vs. Explicit

**What's explicitly taught:** ${stage3Truth?.proofMechanism || "The framework, the diagnostic logic, and the practical application steps."}

**What's implicitly woven in:**
${renderMarkdownBulletList(stage6Patterns?.implicitLessons ?? [], "The stories, emotional permission, and examples teach readers how to think differently while they absorb the framework.")}

**How personas recognize themselves:** ${stage7BookMap?.implicitPersonaService || "Each segment sees its own tension, pressures, and aspirations reflected in the examples and strategic language."}`;
}

export type BookPitchMarketBusinessLaunchParams = Pick<
  BookPitchExecutiveBookVisionParams,
  | "authorCredibility"
  | "nextSteps"
  | "audienceProfiles"
  | "promise"
  | "coreTruths"
  | "transformationArc"
  | "marketReport"
  | "recommendations"
>;

export function renderBookPitchMarketBusinessAndLaunch(
  params: BookPitchMarketBusinessLaunchParams,
): string {
  const competitorLines = params.marketReport.competitiveLandscape.directCompetitors
    .slice(0, 3)
    .map(
      (competitor, index) =>
        `### Primary Competitor ${index + 1}: ${competitor.title} by ${competitor.author}

**Positioning:** ${competitor.positioning}

**Target audience:** ${competitor.targetAudience}

**Strengths:** ${competitor.strengths.join("; ")}

**Weaknesses:** ${competitor.gaps.join("; ")}

**Price point:** ${competitor.pricePoint}

**Your advantage vs. this competitor:** ${competitor.differenceOpportunity}`,
    )
    .join("\n\n");
  const pricingTierLines = params.marketReport.pricingStrategy.pricingTiers
    .map(
      (tier) =>
        `**${tier.format}:** ${tier.pricePoint} — ${tier.rationale}`,
    )
    .join("\n\n");
  const ancillaryLines = params.marketReport.monetizationEcosystem.ancillaryProducts
    .map(
      (product) =>
        `**${product.channel}:** ${product.offer} | ${product.pricePoint} | ${product.revenuePotential}`,
    )
    .join("\n\n");
  const personaStrategies = params.recommendations.personaStrategies.slice(0, 3);

  return `# SECTION 4: COMPETITIVE LANDSCAPE

**Category:** ${params.marketReport.marketCategory}

**Competitive intensity:** ${params.marketReport.saturationAssessment}

**Market trend:** ${params.marketReport.marketSizing.trends}

**White space:** ${params.marketReport.competitiveLandscape.marketPositioning.whiteSpace}

${competitorLines}

### Your Competitive Advantages

**Advantage 1:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.differentiation}
- **Evidence/proof:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.gapFilled}

**Advantage 2:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.unfairAdvantage}
- **Evidence/proof:** ${params.authorCredibility}

**Advantage 3:** ${params.recommendations.bookStrategy.differentiationStrategy}
- **Evidence/proof:** ${params.recommendations.positioningAndMarketing.marketPositioningStatement}

### Positioning Statement

${params.recommendations.positioningAndMarketing.marketPositioningStatement}

### Differentiation Summary

**What only your book has:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.unfairAdvantage}

**Why it matters to readers:** ${params.marketReport.competitiveLandscape.competitiveAdvantage.whoChoosesThisBook}

**How you'll communicate this:** ${params.recommendations.positioningAndMarketing.messagingFramework.join("; ")}

# SECTION 5: MARKET OPPORTUNITY

**TAM:** ${params.marketReport.marketSizing.totalAddressableMarket}

**SAM:** ${params.marketReport.marketSizing.serviceableAddressableMarket}

**SOM Year 1:** ${params.marketReport.marketSizing.serviceableObtainableMarket}

**Demand validation:** ${params.marketReport.audienceDemand.validationSignals}

### Demand Validation

**Is the problem real?** ${params.marketReport.audienceDemand.validationSignals}

**Are personas willing to pay?** ${params.marketReport.audienceDemand.willingnessToPay}

**Is demand growing?** ${params.marketReport.marketSizing.trends}

**How urgent is the need?** ${params.marketReport.audienceDemand.personaUrgency.map((item) => `${item.personaName || "Audience"}: ${item.whyNow}`).join("; ")}

### Market Trends

**Tailwinds:**
${renderMarkdownBulletList(params.marketReport.marketSizing.tailwinds, "Leaders need practical, portable frameworks that help them navigate complexity and execution pressure.")}

**Headwinds:**
${renderMarkdownBulletList(params.marketReport.marketSizing.headwinds, "This market is noisy, and generic leadership content competes for attention.")}

**Timing:** ${params.marketReport.executiveSummary.strategicPriority}

### Sales Projections

**Year 1**
- Conservative: ${params.marketReport.financialProjections.sensitivityAnalysis}
- Realistic: ${params.marketReport.financialProjections.yearOneRevenue}
- Optimistic: ${params.marketReport.marketSizing.yearOneToThreeOutlook}

**Year 2:** ${params.marketReport.financialProjections.yearsTwoToThreeProjection}

**Year 3:** ${params.marketReport.marketSizing.yearOneToThreeOutlook}

# SECTION 6: BUSINESS MODEL

**Primary revenue:** ${params.marketReport.monetizationEcosystem.directBookRevenue}

**Ecosystem revenue:** ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection}

**Pricing strategy:** ${params.recommendations.monetizationRecommendations.bookPricingRecommendation}

### Primary Revenue (Book Sales)

${pricingTierLines}

**Total Year 1 Book Revenue:** ${params.marketReport.financialProjections.yearOneRevenue}

### Ecosystem Revenue (Optional)

${ancillaryLines || "**Ecosystem products:** Still being finalized."}

**Services / Other:** ${params.marketReport.monetizationEcosystem.consultingAndCoaching}

**Total Year 1 Ecosystem Revenue:** ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection}

### Total Revenue & Profitability

**Year 1 Book Revenue:** ${params.marketReport.financialProjections.yearOneRevenue}

**Year 1 Ecosystem Revenue:** ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection}

**Year 1 Total Costs:** ${params.marketReport.financialProjections.yearOneCosts}

**Year 1 Net Profit:** ${params.marketReport.financialProjections.profitabilityAnalysis}

### Revenue Model by Year

| Category | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Book Revenue | ${params.marketReport.financialProjections.yearOneRevenue} | ${params.marketReport.financialProjections.yearsTwoToThreeProjection} | ${params.marketReport.financialProjections.yearsTwoToThreeProjection} |
| Ecosystem Revenue | ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection} | ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection} | ${params.marketReport.monetizationEcosystem.totalEcosystemRevenueProjection} |
| Costs | ${params.marketReport.financialProjections.yearOneCosts} | To be refined | To be refined |
| Profitability | ${params.marketReport.financialProjections.profitabilityAnalysis} | Scales if channel mix improves | Scales if ecosystem converts |

# SECTION 7: LAUNCH & MARKETING STRATEGY

**Publishing path:** ${params.recommendations.launchAndGoToMarket.publishingPathRecommendation}

**Launch timeline:** ${params.recommendations.launchAndGoToMarket.launchTimeline}

**Key channels:** ${params.recommendations.launchAndGoToMarket.distributionChannelPriorities.join("; ")}

### Distribution Channels

**Primary Channel:** ${params.recommendations.launchAndGoToMarket.distributionChannelPriorities[0] || "Primary channel still being finalized"}
- **Target:** ${params.marketReport.distributionAndLaunch.yearOneDistributionMix}
- **Strategy:** ${params.marketReport.distributionAndLaunch.launchStrategy}

**Secondary Channel:** ${params.recommendations.launchAndGoToMarket.distributionChannelPriorities[1] || "Secondary channel still being finalized"}
- **Target:** Supported by audience segment reach and pricing fit
- **Strategy:** ${params.recommendations.positioningAndMarketing.positioningByChannel[1] || params.marketReport.distributionAndLaunch.marketingChannels[1] || "Build credibility and demand in a channel the primary audience already trusts."}

**Tertiary Channel:** ${params.recommendations.launchAndGoToMarket.distributionChannelPriorities[2] || "Tertiary channel still being finalized"}
- **Target:** Opportunistic and partnership-led
- **Strategy:** ${params.marketReport.distributionAndLaunch.marketingChannels[2] || "Use partnerships and authority channels to extend reach."}

### Marketing Channels

**Owned**
${renderMarkdownBulletList(params.marketReport.distributionAndLaunch.marketingChannels.slice(0, 2), "Email, website, and organic content remain the foundation.")}

**Earned**
${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.postLaunchActivities.slice(0, 2), "Speaking, podcast appearances, and partner amplification build credibility and reach.")}

**Paid**
${renderMarkdownBulletList(
  params.recommendations.launchAndGoToMarket.launchActivities.filter((item) =>
    /ads|paid|sponsored/i.test(item),
  ),
  "Use paid only where the audience is reachable and the economics support it.",
)}

**Total Marketing Budget:** ${params.recommendations.launchAndGoToMarket.marketingBudgetAllocation}

### Pre-Launch Activities

**Months -12 to -6**
${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.preLaunchActivities.slice(0, 3), "Clarify positioning, build platform assets, and test messaging with the primary audience.")}

**Months -6 to -3**
${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.preLaunchActivities.slice(3, 6), "Finalize package, line up partners, and build launch assets.")}

### Launch Window

**Months -3 to 0**
${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.launchActivities.slice(0, 4), "Concentrate attention, proof, and distribution in a tight pre-launch window.")}

**Months +1 to +3**
${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.launchActivities.slice(4), "Sustain momentum with reviews, follow-on appearances, and targeted channel support.")}

### Post-Launch Activities

${renderMarkdownBulletList(params.recommendations.launchAndGoToMarket.postLaunchActivities, "Continue authority building, community development, and ecosystem expansion.")}

### Positioning by Persona

${personaStrategies
  .map(
    (strategy) =>
      `**${strategy.personaName}:** ${strategy.keyMessage} | ${strategy.whereToReachThem.join("; ")}`,
  )
  .join("\n\n")}`;
}

export type BookPitchFinancialRecommendationsParams = Pick<
  BookPitchExecutiveBookVisionParams,
  | "recommendation"
  | "rationale"
  | "nextSteps"
  | "audienceProfiles"
  | "promise"
  | "coreTruths"
  | "transformationArc"
  | "marketReport"
  | "recommendations"
  | "bookSetupProfile"
>;

export function renderBookPitchFinancialRecommendationsAndAppendices(
  params: BookPitchFinancialRecommendationsParams,
): string {
  const audienceProfiles = params.audienceProfiles.slice(0, 3);
  const stage7BookMap = params.transformationArc?.arc.stage7BookMap;

  return `# SECTION 8: FINANCIAL PROJECTIONS

**Investment required:** ${params.recommendations.financialRecommendations.investmentRequired}

**Revenue projections:** ${params.recommendations.financialRecommendations.revenueProjections}

**Profitability timeline:** ${params.recommendations.financialRecommendations.profitabilityTimeline}

### Investment Required

${renderMarkdownBulletList(params.recommendations.financialRecommendations.pricingSummary, "Investment assumptions still need final pricing and production alignment.")}

### Revenue Projections Summary

| Metric | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Total Revenue | ${params.marketReport.financialProjections.yearOneRevenue} | ${params.marketReport.financialProjections.yearsTwoToThreeProjection} | ${params.marketReport.financialProjections.yearsTwoToThreeProjection} |
| Total Costs | ${params.marketReport.financialProjections.yearOneCosts} | To be refined | To be refined |
| Net Profit | ${params.marketReport.financialProjections.profitabilityAnalysis} | Expected to improve with leverage | Expected to improve with ecosystem expansion |
| Cumulative Profit | Establish in Year 1 model | Grows if channel mix holds | Matures with ecosystem uptake |

### Break-Even Analysis

**Break-even point:** ${params.recommendations.financialRecommendations.profitabilityTimeline}

**ROI:** ${params.marketReport.financialProjections.profitabilityAnalysis}

### Sensitivity Analysis

**Conservative (50% of projection):** ${params.marketReport.financialProjections.sensitivityAnalysis}

**Optimistic (150% of projection):** ${params.marketReport.marketSizing.yearOneToThreeOutlook}

**Key variables to monitor:** ${params.marketReport.successMetrics.keyPerformanceIndicators.join("; ")}

# SECTION 9: SUCCESS METRICS & KPIS

${params.recommendations.successMetricsAndKpis.yearOneSuccessTargets
  .map((item) => `- ${item}`)
  .join("\n")}

### Key Performance Indicators (Track Monthly)

${renderMarkdownBulletList(params.recommendations.successMetricsAndKpis.monthlyKpis, "Track sales, audience growth, and authority signals every month.")}

### Success Milestones

${renderMarkdownBulletList(params.recommendations.successMetricsAndKpis.successMilestones, "Set milestone checkpoints for pre-launch, launch, and post-launch momentum.")}

### Definition of Success

**What success means:** ${params.marketReport.successMetrics.successDefinition}

**How you'll measure it:** ${params.marketReport.successMetrics.yearOneGoals.join("; ")}

# SECTION 10: RECOMMENDATIONS & NEXT STEPS

### Overall Recommendation

**RECOMMENDATION:** ${params.recommendation.replace(/_/g, " ")}

**Rationale:** ${params.rationale}

### Critical Success Factors

${renderMarkdownBulletList(params.recommendations.finalRecommendation.criticalSuccessFactors, "Clarity of audience, sharp positioning, and disciplined execution are the critical success factors.")}

### Immediate Next Steps (Before Outline)

${renderMarkdownNumberedList(params.nextSteps, "Lock audience, positioning, and structural direction before moving into Outline.")}

### Timeline to Launch

${renderMarkdownBulletList(params.recommendations.teamAndResources.timelineAndMilestones, "Translate the strategy into a realistic writing, production, and launch timeline.")}

### Resource Requirements

**Team members needed:** ${params.recommendations.teamAndResources.teamCompositionRecommendation}

**Budget required:** ${params.recommendations.financialRecommendations.investmentRequired}

**Timeline:** ${params.recommendations.launchAndGoToMarket.launchTimeline}

**Success depends on:** ${params.recommendations.finalRecommendation.strategicDirection}

### Contingency Planning

${renderMarkdownBulletList(params.recommendations.finalRecommendation.contingencyPlanning, "If the market response is weak, tighten the audience, rework the positioning, or reduce scope before scaling the launch plan.")}

# APPENDICES

- Voice blend: ${summarizeVoiceBlendForPitch(params.bookSetupProfile)}
- Market recommendation: ${params.marketReport.goNoGoRecommendation.overallRecommendation}
- Recommendation blueprint summary: ${params.recommendations.summary}
- Audience segments: ${audienceProfiles.map((profile) => profile.label).join("; ")}
- Core truth: ${params.coreTruths?.completeTruth || params.promise.coreTruth || params.promise.bigIdea}
- Book map: ${stage7BookMap?.openingStory || "Opening story and section architecture still being refined."}`;
}
