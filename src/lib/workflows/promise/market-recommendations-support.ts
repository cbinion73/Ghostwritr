import { z } from "zod";

import type {
  AudienceResearchArtifact,
  CoreTruthsArtifact,
  MarketReport,
  PersonaDeepProfile,
  PersonaPack,
  PositioningRecommendations,
  PromiseBrief,
  TransformationArtifact,
} from "../../promise-types";
import type { TruthPersonaContext } from "./report-presentation";
import { buildTruthPersonaContexts } from "./report-persona-context";
import { normalizeMarketDecision } from "./report-schema";
import { buildMarketGroundingContext } from "./market-analysis-grounding";
import { normalizeTokenUsageMetadata } from "./market-analysis-normalization";
import { asRecord, coerceString, coerceStringArray } from "./market-analysis-support";

export const PositioningRecommendationsSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()).default([]),
  bookStrategy: z.object({
    coreMessagePositioning: z.string(),
    audienceTargeting: z.string(),
    contentDepthAndBreadth: z.string(),
    lengthAndStructure: z.string(),
    voiceAndToneRecommendations: z.string(),
    differentiationStrategy: z.string(),
  }),
  positioningAndMarketing: z.object({
    marketPositioningStatement: z.string(),
    keyDifferentiators: z.array(z.string()).default([]),
    targetCustomerProfile: z.string(),
    positioningByChannel: z.array(z.string()).default([]),
    messagingFramework: z.array(z.string()).default([]),
    competitivePositioningQuadrant: z.string(),
  }),
  launchAndGoToMarket: z.object({
    publishingPathRecommendation: z.string(),
    launchTimeline: z.string(),
    preLaunchActivities: z.array(z.string()).default([]),
    launchActivities: z.array(z.string()).default([]),
    postLaunchActivities: z.array(z.string()).default([]),
    distributionChannelPriorities: z.array(z.string()).default([]),
    marketingBudgetAllocation: z.string(),
  }),
  personaStrategies: z.array(
    z.object({
      personaName: z.string(),
      primaryPositioning: z.string(),
      keyMessage: z.string(),
      whereToReachThem: z.array(z.string()).default([]),
      priceSensitivity: z.string(),
      contentFormatPreference: z.string(),
      trustedInfluencers: z.array(z.string()).default([]),
      launchStrategy: z.string(),
    }),
  ).default([]),
  crossPersonaMessaging: z.object({
    sharedMessaging: z.array(z.string()).default([]),
    personaSpecificMessaging: z.array(z.string()).default([]),
    avoidAlienating: z.string(),
  }),
  monetizationRecommendations: z.object({
    bookPricingRecommendation: z.string(),
    ancillaryProductRecommendations: z.array(z.string()).default([]),
    ecosystemBuildOutTimeline: z.array(z.string()).default([]),
    revenueModelRecommendation: z.string(),
    pricingStrategyByChannel: z.array(z.string()).default([]),
  }),
  teamAndResources: z.object({
    writingSupport: z.string(),
    designAndProduction: z.string(),
    marketingAndLaunchSupport: z.string(),
    platformAndTools: z.string(),
    teamCompositionRecommendation: z.string(),
    timelineAndMilestones: z.array(z.string()).default([]),
  }),
  riskMitigationRecommendations: z.array(
    z.object({
      risk: z.string(),
      mitigationStrategy: z.string(),
      whatToMonitor: z.string(),
      pivotPoint: z.string(),
    }),
  ).default([]),
  successMetricsAndKpis: z.object({
    yearOneSuccessTargets: z.array(z.string()).default([]),
    monthlyKpis: z.array(z.string()).default([]),
    dashboardMetrics: z.array(z.string()).default([]),
    successMilestones: z.array(z.string()).default([]),
    pivotingCriteria: z.array(z.string()).default([]),
  }),
  financialRecommendations: z.object({
    investmentRequired: z.string(),
    revenueProjections: z.string(),
    profitabilityTimeline: z.string(),
    pricingSummary: z.array(z.string()).default([]),
    budgetAllocationRecommendation: z.string(),
  }),
  finalRecommendation: z.object({
    overallRecommendation: z.enum(["GO", "NO_GO", "CONDITIONAL_GO"]),
    rationale: z.string(),
    strategicDirection: z.string(),
    criticalSuccessFactors: z.array(z.string()).default([]),
    immediateNextSteps: z.array(z.string()).default([]),
    goNoGoGates: z.array(z.string()).default([]),
    contingencyPlanning: z.array(z.string()).default([]),
  }),
  metadata: z.object({
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    model: z.string().nullable(),
    grounding: z.object({
      previousPhases: z.array(z.string()).nullable(),
      kbSources: z.array(z.string()).nullable(),
      audienceSignals: z.array(z.string()).nullable(),
    }).nullable(),
    tokenUsage: z.object({
      inputTokens: z.number().nullable(),
      outputTokens: z.number().nullable(),
      totalTokens: z.number().nullable(),
      cacheReadInputTokens: z.number().nullable(),
      cacheWriteInputTokens: z.number().nullable(),
      reasoningTokens: z.number().nullable(),
    }).nullable(),
  }).nullable(),
});

export function fallbackRecommendations(
  promise: PromiseBrief,
  marketReport: MarketReport,
  personaContexts: TruthPersonaContext[] = buildTruthPersonaContexts(promise, undefined, undefined),
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
): PositioningRecommendations {
  const marketDecision = marketReport.goNoGoRecommendation?.overallRecommendation ?? "CONDITIONAL_GO";
  const primaryPersona =
    personaContexts[0]?.name ?? promise.audiencePrimary ?? "Primary Reader";
  const coreTruth =
    coreTruths?.coreInsight.coreTruth ||
    promise.coreTruth ||
    "The reader needs a more useful operating model, not more generic advice.";
  const transformationOutcome =
    transformationArc?.arc.completeTransformation ||
    promise.transformationAfter ||
    "A clearer and more repeatable way to create results.";
  const summary = `The strongest path is to position ${promise.workingTitle} for ${primaryPersona} around the truth that ${coreTruth.toLowerCase()}. Commercially, the book should lead with a narrow buyer, a defendable practical mechanism, and a launch plan that treats the book as the anchor for broader authority and ecosystem growth.`;
  const recommendations = [
    "Write to the most urgent primary persona first and let secondary personas follow through adjacent relevance.",
    "Carry the TRUTH and transformation language directly into positioning, launch messaging, and the outline.",
    "Use the market wedge to guide not only messaging but also book structure, ancillary offers, and channel priorities.",
    ...(Array.isArray(marketReport.recommendations) ? marketReport.recommendations : []),
  ];

  return {
    summary,
    recommendations,
    bookStrategy: {
      coreMessagePositioning: `Position the book around one governing reframe: ${coreTruth}. That message should be phrased in the language the primary persona already uses to describe the problem, not in abstract author language.`,
      audienceTargeting: `Make ${primaryPersona} the primary audience because the book gets stronger when written for a specific live pain. Secondary personas should still see themselves in the framing through adjacent examples, channel messaging, and supporting stories.`,
      contentDepthAndBreadth: `Go deep enough on the core framework that the book feels complete for the primary persona, but reserve highly customized implementation layers for workbook, course, or consulting extensions. Every chapter should reinforce the same wedge instead of widening into generic adjacent topics.`,
      lengthAndStructure: `Aim for a practical business-book length aligned with comparable titles and reader attention. Structure the book so the promise, TRUTH, transformation, and application ladder cleanly from diagnosis to action to future-state vision.`,
      voiceAndToneRecommendations: `Lead with a voice blend that keeps practical credibility primary, emotional clarity present, and inspiration used selectively. The tone should feel professional and direct rather than academic or hype-driven.`,
      differentiationStrategy: `Differentiate through the specific buyer, the truth reframe, the practical mechanism, and the author's lived authority. The book should sound like the only one that solves this exact problem in this exact way.`,
    },
    positioningAndMarketing: {
      marketPositioningStatement: `For ${primaryPersona}, ${promise.workingTitle} is a practical business book that helps them ${(promise.readerDesire ?? "").toLowerCase() || "create better outcomes"} by teaching ${(coreTruth ?? "").toLowerCase()}, unlike broader competitors that diagnose the category without giving this reader a tailored operating model.`,
      keyDifferentiators: [
        "Sharper primary buyer definition than generic category books",
        "A core truth tied directly to day-to-day pressure and decision friction",
        "A transformation arc that makes the framework feel lived, not merely conceptual",
        "Commercial positioning that can travel across book, speaking, training, and ecosystem offers",
      ],
      targetCustomerProfile: `${primaryPersona} is the ideal buyer: someone with meaningful stakes, active learning behavior, and willingness to pay for practical clarity that can improve visible outcomes. They are most likely to discover the book through trusted professional channels, peers, or adjacent authority signals rather than random browsing alone.`,
      positioningByChannel: [
        "Retail/Amazon: lead with problem-solution clarity, specific buyer relevance, and concrete transformation.",
        "Speaking/events: lead with authority, proof, and the distinct practical framework.",
        "Owned channels: lead with the longer transformation story and why this worldview shift matters now.",
        "Corporate/bulk: lead with team impact, repeatability, and business outcomes.",
        "Social/LinkedIn: lead with short diagnostic insights that dramatize the false belief and reframe.",
      ],
      messagingFramework: [
        `Core promise: ${promise.promiseStatement}`,
        `Unique approach: ${coreTruth}`,
        `Who it's for: ${primaryPersona} and adjacent professionals who feel the same operating tension`,
      ],
      competitivePositioningQuadrant: marketReport.competitiveLandscape?.marketPositioning?.whiteSpace ?? "",
    },
    launchAndGoToMarket: {
      publishingPathRecommendation: `The recommended path should reflect your goals for control, speed, authority, and distribution. If platform leverage is strong, hybrid or self-directed models can compound faster; if borrowed distribution and trade credibility matter more, traditional may be worth the tradeoffs.`,
      launchTimeline: `Use a pre-launch runway, a concentrated launch window, and a longer post-launch compounding plan. The timing should align with when the primary persona is most reachable and most likely to act on the problem.`,
      preLaunchActivities: [
        "Validate title, promise, and chapter framing with real target readers.",
        "Build owned audience assets and repeatable content around the core truth.",
        "Secure endorsements, podcast targets, partnerships, and speaking opportunities before launch week.",
        "Prepare the website, lead magnets, launch assets, and messaging variants by persona and channel.",
      ],
      launchActivities: [
        "Coordinate an email launch sequence tied to the strongest buyer pain and transformation promise.",
        "Run a focused visibility push across social, podcasts, partners, and speaking moments.",
        "Collect reviews, testimonials, and early proof that the framework resonates in practice.",
      ],
      postLaunchActivities: [
        "Sustain content around the framework instead of disappearing after launch week.",
        "Use post-launch data to improve channel messaging, ancillary offers, and conversion paths.",
        "Translate traction into workshops, speaking, community, or training extensions.",
      ],
      distributionChannelPriorities: [
        "Owned audience and direct channels for control and higher-value conversion",
        "Retail discovery for category legitimacy and ongoing long-tail sales",
        "Speaking, partner, and organizational channels for leverage and bulk conversion",
      ],
      marketingBudgetAllocation: `Allocate budget toward the channels most likely to reach ${primaryPersona} efficiently, with enough reserve to support content, launch assets, and follow-through after the initial window.`,
    },
    personaStrategies: personaContexts.slice(0, 3).map((persona) => ({
      personaName: persona.name,
      primaryPositioning: `${promise.workingTitle} should be framed for ${persona.name} as a practical answer to ${persona.dilemma.toLowerCase()}`,
      keyMessage: `${coreTruth} is the message most likely to land when translated into ${persona.name}'s role context.`,
      whereToReachThem: [
        "Trusted professional communities",
        "Role-specific content channels",
        "Peer recommendations, podcasts, and speaking environments",
      ],
      priceSensitivity: "Book-level pricing is accessible; premium conversion depends on clear business value.",
      contentFormatPreference: "Practical frameworks, examples, and implementation guidance over abstract theory.",
      trustedInfluencers: ["Recognized domain experts", "Respected practitioners", "Peers with visible operating credibility"],
      launchStrategy: `Reach ${persona.name} with a message that names their specific friction, then show how the book reduces it through a practical, credible mechanism.`,
    })),
    crossPersonaMessaging: {
      sharedMessaging: [
        "The old explanation of the problem is no longer enough.",
        "A better operating model creates clearer, more repeatable progress.",
        "This book turns a felt problem into a practical path forward.",
      ],
      personaSpecificMessaging: [
        "Tailor the examples, stakes, and implementation scenes to each primary persona context.",
        "Adjust the channel emphasis based on where each persona already looks for insight and proof.",
      ],
      avoidAlienating: "Anchor the book in one primary buyer while using adjacent examples that let secondary personas recognize themselves without feeling like the book is trying to serve everyone equally.",
    },
    monetizationRecommendations: {
      bookPricingRecommendation: `Use pricing that matches the professional/business category while signaling enough authority and utility to support the book's positioning.`,
      ancillaryProductRecommendations: [
        "Launch or plan a workbook that extends the framework into templates, checklists, and guided exercises.",
        "Prepare a course or workshop version of the mechanism for buyers who want implementation help.",
        "Use the book to open higher-value speaking, training, or consulting conversations when fit exists.",
      ],
      ecosystemBuildOutTimeline: [
        "Launch: book plus basic lead capture and content sequence",
        "0-3 months: workbook, workshop, or speaking package",
        "3-9 months: course, community, or team implementation offer",
        "9+ months: broader training, licensing, or advisory extensions",
      ],
      revenueModelRecommendation: `Treat the book as the anchor asset rather than the only revenue source. The healthiest model combines book reach with selected higher-margin follow-on offers.`,
      pricingStrategyByChannel: [
        "Direct: price to reflect proximity, trust, and added value.",
        "Retail: stay inside category norms while signaling professional value.",
        "Corporate/bulk: use structured discounts tied to team or program outcomes.",
        "Courses/ecosystem: price according to implementation depth and transformation value.",
      ],
    },
    teamAndResources: {
      writingSupport: "Use the right editorial support for argument clarity, narrative flow, and market sharpness before draft volume becomes the bottleneck.",
      designAndProduction: "Budget for cover, layout, formatting, and optional audio in a way that matches the intended commercial signal of the book.",
      marketingAndLaunchSupport: "Add launch support if the author cannot both write and consistently run promotion, outreach, and follow-up.",
      platformAndTools: "Use a lean stack for email, website, audience capture, analytics, and any course or webinar layer needed for the ecosystem.",
      teamCompositionRecommendation: "Minimum viable team is author plus editor plus designer, with launch and marketing support added as execution complexity rises.",
      timelineAndMilestones: [
        "Define scope, positioning, and team before full drafting.",
        "Draft against the approved transformation and market wedge, not against a vague topic.",
        "Use editorial, production, and launch prep milestones that preserve time for validation and iteration.",
      ],
    },
    riskMitigationRecommendations: [
      {
        risk: "Market saturation or weak differentiation",
        mitigationStrategy: "Pressure-test the title, promise, and wedge against top competitors before the outline is finalized.",
        whatToMonitor: "Reader confusion, comp overlap, and channel response to the positioning.",
        pivotPoint: "If target readers cannot immediately explain why this book is different, tighten the positioning before moving deeper into production.",
      },
      {
        risk: "Platform or reach risk",
        mitigationStrategy: "Build owned audience and partner channels early so launch does not depend on last-minute discovery.",
        whatToMonitor: "Audience growth, engagement, partner pipeline, and early pre-launch interest.",
        pivotPoint: "If reach remains weak, shift more effort into partnerships, speaking, and direct audience building before launch.",
      },
      {
        risk: "Execution risk",
        mitigationStrategy: "Use clear milestones, editorial checkpoints, and launch owners so the book does not stall between concept and delivery.",
        whatToMonitor: "Draft progress, production readiness, and launch-asset completion.",
        pivotPoint: "If key milestones slip repeatedly, reduce scope or extend timeline before quality degrades.",
      },
    ],
    successMetricsAndKpis: {
      yearOneSuccessTargets: [
        "A realistic sales target by channel",
        "Visible audience growth in owned channels",
        "Proof that the book creates downstream opportunity for speaking, training, or ecosystem offers",
      ],
      monthlyKpis: [
        "Units sold and revenue by channel",
        "Audience growth and engagement",
        "Lead capture and offer conversion",
        "Reviews, endorsements, and authority signals",
      ],
      dashboardMetrics: [
        "Sales",
        "Audience growth",
        "Engagement",
        "Offer conversion",
        "Speaking/authority opportunities",
      ],
      successMilestones: [
        "3 months: confirm traction and message resonance",
        "6 months: convert traction into a stronger ecosystem path",
        "12 months: validate whether the book is compounding authority and revenue",
      ],
      pivotingCriteria: [
        "If positioning fails to convert interest into sales, tighten the buyer and message.",
        "If a competitor crowds the space, emphasize the book's distinct truth and mechanism more aggressively.",
        "If channel performance diverges, reallocate effort toward the highest-leverage distribution paths.",
      ],
    },
    financialRecommendations: {
      investmentRequired: "Set an upfront investment range that covers editorial, design, launch, tooling, and a contingency buffer.",
      revenueProjections: `Use conservative, realistic, and optimistic scenarios tied to the ${marketDecision.toLowerCase()} market recommendation and the actual distribution plan.`,
      profitabilityTimeline: "Plan for break-even based on channel mix and ecosystem conversion, not book-unit optimism alone.",
      pricingSummary: [
        "Hardcover: premium signal within category norms",
        "Paperback: standard accessible tier",
        "Ebook: lower-friction entry tier",
        "Higher-value offers: price to the implementation outcome, not the book benchmark",
      ],
      budgetAllocationRecommendation: "Prioritize spending on product quality, launch readiness, and the channels most likely to reach the primary persona efficiently.",
    },
    finalRecommendation: {
      overallRecommendation: marketDecision,
      rationale: `The recommendation is ${marketDecision.replace(/_/g, " ")} because the project looks strongest when it keeps a narrow buyer, a clear truth reframe, a differentiated market wedge, and a realistic ecosystem model.`,
      strategicDirection: `Proceed by treating the book as the lead asset for ${transformationOutcome.toLowerCase()} rather than as a standalone manuscript disconnected from launch and monetization strategy.`,
      criticalSuccessFactors: [
        "Sharper primary-buyer positioning",
        "Consistent translation of truth into market messaging",
        "Launch execution that matches the intended commercial path",
      ],
      immediateNextSteps: [
        "Lock the primary persona and one-sentence market positioning statement.",
        "Pressure-test the outline direction against the strongest competitors and the approved truth.",
        "Draft a launch and ecosystem plan before assuming book-only success.",
        "Validate messaging with real readers or partners in the primary audience.",
        "Confirm timeline, ownership, and budget before moving fully into Outline.",
      ],
      goNoGoGates: [
        "Market analysis complete and validated",
        "Promise statement locked",
        "Personas research complete",
        "Transformation journey mapped",
        "Financial model acceptable",
        "Team/resources secured",
        "Timeline confirmed",
      ],
      contingencyPlanning: [
        "If market response is weak, tighten the buyer and wedge before expanding scope.",
        "If the book struggles to stand apart, amplify the mechanism, proof, and persona-specific pain.",
        "If launch reach is too low, shift into a partnership- and speaking-led distribution plan.",
      ],
    },
  };
}

export function buildRecommendationsGroundingContext(
  promise: PromiseBrief,
  audienceResearch: AudienceResearchArtifact | undefined,
  deepProfiles: PersonaDeepProfile[] | undefined,
  simplePersonas: PersonaPack["personas"] | undefined,
  coreTruths: CoreTruthsArtifact | undefined,
  transformationArc: TransformationArtifact | undefined,
  marketReport: MarketReport,
  personaContexts: TruthPersonaContext[],
) {
  const base = buildMarketGroundingContext(
    promise,
    audienceResearch,
    deepProfiles,
    simplePersonas,
    coreTruths,
    transformationArc,
    personaContexts,
  );

  return {
    previousPhases: [...base.previousPhases, "Market"],
    audienceSignals: [
      ...base.audienceSignals,
      marketReport.executiveSummary.headline,
      marketReport.executiveSummary.rationale,
      ...marketReport.recommendations.slice(0, 3),
    ]
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, 12),
    promptPayload: {
      ...base.promptPayload,
      marketSummary: {
        headline: marketReport.executiveSummary.headline,
        overallRecommendation: marketReport.executiveSummary.overallRecommendation,
        rationale: marketReport.executiveSummary.rationale,
        strategicPriority: marketReport.executiveSummary.strategicPriority,
        category: marketReport.marketCategory,
        whiteSpace: marketReport.competitiveLandscape.marketPositioning.whiteSpace,
        attractionDrivers: marketReport.attractionDrivers,
        commercialRisks: marketReport.commercialRisks,
        competitiveAdvantage: marketReport.competitiveLandscape.competitiveAdvantage,
        goNoGoRecommendation: marketReport.goNoGoRecommendation,
        distributionAndLaunch: marketReport.distributionAndLaunch,
        monetizationEcosystem: marketReport.monetizationEcosystem,
      },
      instruction:
        "Synthesize the research into a recommendations blueprint. Every recommendation should map back to the approved Promise, Audience, Truth, Transformation, and Market work.",
    },
  };
}

export function normalizeRecommendationsPersonaStrategy(
  value: unknown,
  index: number,
  fallbackName: string,
): PositioningRecommendations["personaStrategies"][number] {
  const raw = asRecord(value);
  return {
    personaName: coerceString(raw.personaName, fallbackName || `Persona ${index + 1}`),
    primaryPositioning: coerceString(
      raw.primaryPositioning,
      "Position the book around the persona's most urgent live problem.",
    ),
    keyMessage: coerceString(raw.keyMessage, "Lead with the clearest problem-solution reframe."),
    whereToReachThem: coerceStringArray(raw.whereToReachThem),
    priceSensitivity: coerceString(
      raw.priceSensitivity,
      "Responsive to clear value at book-level pricing; higher-value offers require visible ROI.",
    ),
    contentFormatPreference: coerceString(
      raw.contentFormatPreference,
      "Practical frameworks, examples, and implementation guidance.",
    ),
    trustedInfluencers: coerceStringArray(raw.trustedInfluencers),
    launchStrategy: coerceString(
      raw.launchStrategy,
      "Reach them where they already look for role-relevant insight and proof.",
    ),
  };
}

export function normalizeRecommendationsRisk(
  value: unknown,
  index: number,
): PositioningRecommendations["riskMitigationRecommendations"][number] {
  const raw = asRecord(value);
  return {
    risk: coerceString(raw.risk, `Risk ${index + 1}`),
    mitigationStrategy: coerceString(
      raw.mitigationStrategy,
      "Create a concrete mitigation plan tied to positioning, audience, and execution.",
    ),
    whatToMonitor: coerceString(
      raw.whatToMonitor,
      "Monitor the leading indicators that show whether the strategy is working.",
    ),
    pivotPoint: coerceString(
      raw.pivotPoint,
      "Define a clear threshold at which the strategy should be adjusted.",
    ),
  };
}

export function normalizeRecommendationsArtifact(
  raw: unknown,
  promise: PromiseBrief,
  marketReport: MarketReport,
  personaContexts: TruthPersonaContext[],
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
): PositioningRecommendations {
  const fallback = fallbackRecommendations(
    promise,
    marketReport,
    personaContexts,
    coreTruths,
    transformationArc,
  );
  const record = asRecord(raw);
  const bookStrategy = asRecord(record.bookStrategy);
  const positioningAndMarketing = asRecord(record.positioningAndMarketing);
  const launchAndGoToMarket = asRecord(record.launchAndGoToMarket);
  const crossPersonaMessaging = asRecord(record.crossPersonaMessaging);
  const monetizationRecommendations = asRecord(record.monetizationRecommendations);
  const teamAndResources = asRecord(record.teamAndResources);
  const successMetricsAndKpis = asRecord(record.successMetricsAndKpis);
  const financialRecommendations = asRecord(record.financialRecommendations);
  const finalRecommendation = asRecord(record.finalRecommendation);
  const metadata = asRecord(record.metadata);
  const rawPersonaStrategies = Array.isArray(record.personaStrategies)
    ? record.personaStrategies
    : [];
  const rawRiskMitigation = Array.isArray(record.riskMitigationRecommendations)
    ? record.riskMitigationRecommendations
    : [];

  return PositioningRecommendationsSchema.parse({
    summary: coerceString(record.summary, fallback.summary),
    recommendations:
      coerceStringArray(record.recommendations).length > 0
        ? coerceStringArray(record.recommendations)
        : fallback.recommendations,
    bookStrategy: {
      coreMessagePositioning: coerceString(
        bookStrategy.coreMessagePositioning,
        fallback.bookStrategy.coreMessagePositioning,
      ),
      audienceTargeting: coerceString(
        bookStrategy.audienceTargeting,
        fallback.bookStrategy.audienceTargeting,
      ),
      contentDepthAndBreadth: coerceString(
        bookStrategy.contentDepthAndBreadth,
        fallback.bookStrategy.contentDepthAndBreadth,
      ),
      lengthAndStructure: coerceString(
        bookStrategy.lengthAndStructure,
        fallback.bookStrategy.lengthAndStructure,
      ),
      voiceAndToneRecommendations: coerceString(
        bookStrategy.voiceAndToneRecommendations,
        fallback.bookStrategy.voiceAndToneRecommendations,
      ),
      differentiationStrategy: coerceString(
        bookStrategy.differentiationStrategy,
        fallback.bookStrategy.differentiationStrategy,
      ),
    },
    positioningAndMarketing: {
      marketPositioningStatement: coerceString(
        positioningAndMarketing.marketPositioningStatement,
        fallback.positioningAndMarketing.marketPositioningStatement,
      ),
      keyDifferentiators:
        coerceStringArray(positioningAndMarketing.keyDifferentiators).length > 0
          ? coerceStringArray(positioningAndMarketing.keyDifferentiators)
          : fallback.positioningAndMarketing.keyDifferentiators,
      targetCustomerProfile: coerceString(
        positioningAndMarketing.targetCustomerProfile,
        fallback.positioningAndMarketing.targetCustomerProfile,
      ),
      positioningByChannel:
        coerceStringArray(positioningAndMarketing.positioningByChannel).length > 0
          ? coerceStringArray(positioningAndMarketing.positioningByChannel)
          : fallback.positioningAndMarketing.positioningByChannel,
      messagingFramework:
        coerceStringArray(positioningAndMarketing.messagingFramework).length > 0
          ? coerceStringArray(positioningAndMarketing.messagingFramework)
          : fallback.positioningAndMarketing.messagingFramework,
      competitivePositioningQuadrant: coerceString(
        positioningAndMarketing.competitivePositioningQuadrant,
        fallback.positioningAndMarketing.competitivePositioningQuadrant,
      ),
    },
    launchAndGoToMarket: {
      publishingPathRecommendation: coerceString(
        launchAndGoToMarket.publishingPathRecommendation,
        fallback.launchAndGoToMarket.publishingPathRecommendation,
      ),
      launchTimeline: coerceString(
        launchAndGoToMarket.launchTimeline,
        fallback.launchAndGoToMarket.launchTimeline,
      ),
      preLaunchActivities:
        coerceStringArray(launchAndGoToMarket.preLaunchActivities).length > 0
          ? coerceStringArray(launchAndGoToMarket.preLaunchActivities)
          : fallback.launchAndGoToMarket.preLaunchActivities,
      launchActivities:
        coerceStringArray(launchAndGoToMarket.launchActivities).length > 0
          ? coerceStringArray(launchAndGoToMarket.launchActivities)
          : fallback.launchAndGoToMarket.launchActivities,
      postLaunchActivities:
        coerceStringArray(launchAndGoToMarket.postLaunchActivities).length > 0
          ? coerceStringArray(launchAndGoToMarket.postLaunchActivities)
          : fallback.launchAndGoToMarket.postLaunchActivities,
      distributionChannelPriorities:
        coerceStringArray(launchAndGoToMarket.distributionChannelPriorities).length > 0
          ? coerceStringArray(launchAndGoToMarket.distributionChannelPriorities)
          : fallback.launchAndGoToMarket.distributionChannelPriorities,
      marketingBudgetAllocation: coerceString(
        launchAndGoToMarket.marketingBudgetAllocation,
        fallback.launchAndGoToMarket.marketingBudgetAllocation,
      ),
    },
    personaStrategies:
      rawPersonaStrategies.length > 0
        ? rawPersonaStrategies.map((item, index) =>
            normalizeRecommendationsPersonaStrategy(
              item,
              index,
              personaContexts[index]?.name ?? `Persona ${index + 1}`,
            ),
          )
        : fallback.personaStrategies,
    crossPersonaMessaging: {
      sharedMessaging:
        coerceStringArray(crossPersonaMessaging.sharedMessaging).length > 0
          ? coerceStringArray(crossPersonaMessaging.sharedMessaging)
          : fallback.crossPersonaMessaging.sharedMessaging,
      personaSpecificMessaging:
        coerceStringArray(crossPersonaMessaging.personaSpecificMessaging).length > 0
          ? coerceStringArray(crossPersonaMessaging.personaSpecificMessaging)
          : fallback.crossPersonaMessaging.personaSpecificMessaging,
      avoidAlienating: coerceString(
        crossPersonaMessaging.avoidAlienating,
        fallback.crossPersonaMessaging.avoidAlienating,
      ),
    },
    monetizationRecommendations: {
      bookPricingRecommendation: coerceString(
        monetizationRecommendations.bookPricingRecommendation,
        fallback.monetizationRecommendations.bookPricingRecommendation,
      ),
      ancillaryProductRecommendations:
        coerceStringArray(monetizationRecommendations.ancillaryProductRecommendations).length > 0
          ? coerceStringArray(monetizationRecommendations.ancillaryProductRecommendations)
          : fallback.monetizationRecommendations.ancillaryProductRecommendations,
      ecosystemBuildOutTimeline:
        coerceStringArray(monetizationRecommendations.ecosystemBuildOutTimeline).length > 0
          ? coerceStringArray(monetizationRecommendations.ecosystemBuildOutTimeline)
          : fallback.monetizationRecommendations.ecosystemBuildOutTimeline,
      revenueModelRecommendation: coerceString(
        monetizationRecommendations.revenueModelRecommendation,
        fallback.monetizationRecommendations.revenueModelRecommendation,
      ),
      pricingStrategyByChannel:
        coerceStringArray(monetizationRecommendations.pricingStrategyByChannel).length > 0
          ? coerceStringArray(monetizationRecommendations.pricingStrategyByChannel)
          : fallback.monetizationRecommendations.pricingStrategyByChannel,
    },
    teamAndResources: {
      writingSupport: coerceString(
        teamAndResources.writingSupport,
        fallback.teamAndResources.writingSupport,
      ),
      designAndProduction: coerceString(
        teamAndResources.designAndProduction,
        fallback.teamAndResources.designAndProduction,
      ),
      marketingAndLaunchSupport: coerceString(
        teamAndResources.marketingAndLaunchSupport,
        fallback.teamAndResources.marketingAndLaunchSupport,
      ),
      platformAndTools: coerceString(
        teamAndResources.platformAndTools,
        fallback.teamAndResources.platformAndTools,
      ),
      teamCompositionRecommendation: coerceString(
        teamAndResources.teamCompositionRecommendation,
        fallback.teamAndResources.teamCompositionRecommendation,
      ),
      timelineAndMilestones:
        coerceStringArray(teamAndResources.timelineAndMilestones).length > 0
          ? coerceStringArray(teamAndResources.timelineAndMilestones)
          : fallback.teamAndResources.timelineAndMilestones,
    },
    riskMitigationRecommendations:
      rawRiskMitigation.length > 0
        ? rawRiskMitigation.map(normalizeRecommendationsRisk)
        : fallback.riskMitigationRecommendations,
    successMetricsAndKpis: {
      yearOneSuccessTargets:
        coerceStringArray(successMetricsAndKpis.yearOneSuccessTargets).length > 0
          ? coerceStringArray(successMetricsAndKpis.yearOneSuccessTargets)
          : fallback.successMetricsAndKpis.yearOneSuccessTargets,
      monthlyKpis:
        coerceStringArray(successMetricsAndKpis.monthlyKpis).length > 0
          ? coerceStringArray(successMetricsAndKpis.monthlyKpis)
          : fallback.successMetricsAndKpis.monthlyKpis,
      dashboardMetrics:
        coerceStringArray(successMetricsAndKpis.dashboardMetrics).length > 0
          ? coerceStringArray(successMetricsAndKpis.dashboardMetrics)
          : fallback.successMetricsAndKpis.dashboardMetrics,
      successMilestones:
        coerceStringArray(successMetricsAndKpis.successMilestones).length > 0
          ? coerceStringArray(successMetricsAndKpis.successMilestones)
          : fallback.successMetricsAndKpis.successMilestones,
      pivotingCriteria:
        coerceStringArray(successMetricsAndKpis.pivotingCriteria).length > 0
          ? coerceStringArray(successMetricsAndKpis.pivotingCriteria)
          : fallback.successMetricsAndKpis.pivotingCriteria,
    },
    financialRecommendations: {
      investmentRequired: coerceString(
        financialRecommendations.investmentRequired,
        fallback.financialRecommendations.investmentRequired,
      ),
      revenueProjections: coerceString(
        financialRecommendations.revenueProjections,
        fallback.financialRecommendations.revenueProjections,
      ),
      profitabilityTimeline: coerceString(
        financialRecommendations.profitabilityTimeline,
        fallback.financialRecommendations.profitabilityTimeline,
      ),
      pricingSummary:
        coerceStringArray(financialRecommendations.pricingSummary).length > 0
          ? coerceStringArray(financialRecommendations.pricingSummary)
          : fallback.financialRecommendations.pricingSummary,
      budgetAllocationRecommendation: coerceString(
        financialRecommendations.budgetAllocationRecommendation,
        fallback.financialRecommendations.budgetAllocationRecommendation,
      ),
    },
    finalRecommendation: {
      overallRecommendation: normalizeMarketDecision(
        finalRecommendation.overallRecommendation,
        fallback.finalRecommendation.overallRecommendation,
      ),
      rationale: coerceString(
        finalRecommendation.rationale,
        fallback.finalRecommendation.rationale,
      ),
      strategicDirection: coerceString(
        finalRecommendation.strategicDirection,
        fallback.finalRecommendation.strategicDirection,
      ),
      criticalSuccessFactors:
        coerceStringArray(finalRecommendation.criticalSuccessFactors).length > 0
          ? coerceStringArray(finalRecommendation.criticalSuccessFactors)
          : fallback.finalRecommendation.criticalSuccessFactors,
      immediateNextSteps:
        coerceStringArray(finalRecommendation.immediateNextSteps).length > 0
          ? coerceStringArray(finalRecommendation.immediateNextSteps)
          : fallback.finalRecommendation.immediateNextSteps,
      goNoGoGates:
        coerceStringArray(finalRecommendation.goNoGoGates).length > 0
          ? coerceStringArray(finalRecommendation.goNoGoGates)
          : fallback.finalRecommendation.goNoGoGates,
      contingencyPlanning:
        coerceStringArray(finalRecommendation.contingencyPlanning).length > 0
          ? coerceStringArray(finalRecommendation.contingencyPlanning)
          : fallback.finalRecommendation.contingencyPlanning,
    },
    metadata: {
      createdAt: coerceString(metadata.createdAt, fallback.metadata?.createdAt ?? new Date().toISOString()),
      updatedAt: coerceString(metadata.updatedAt, fallback.metadata?.updatedAt ?? new Date().toISOString()),
      model: coerceString(metadata.model, fallback.metadata?.model ?? "legacy"),
      tokenUsage:
        normalizeTokenUsageMetadata(metadata.tokenUsage) ??
        fallback.metadata?.tokenUsage ??
        null,
      grounding: {
        previousPhases:
          coerceStringArray(asRecord(metadata.grounding).previousPhases).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).previousPhases)
            : fallback.metadata?.grounding?.previousPhases ?? [],
        kbSources:
          coerceStringArray(asRecord(metadata.grounding).kbSources).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).kbSources)
            : fallback.metadata?.grounding?.kbSources ?? [],
        audienceSignals:
          coerceStringArray(asRecord(metadata.grounding).audienceSignals).length > 0
            ? coerceStringArray(asRecord(metadata.grounding).audienceSignals)
            : fallback.metadata?.grounding?.audienceSignals ?? [],
      },
    },
  });
}
