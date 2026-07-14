import type {
  CoreTruthsArtifact,
  MarketReport,
  PromiseBrief,
  TransformationArtifact,
} from "../../promise-types";
import { buildTruthPersonaContexts } from "./report-persona-context";
import type { TruthPersonaContext } from "./report-presentation";

export function createFallbackMarketReport(
  promise: PromiseBrief,
  personaContexts: TruthPersonaContext[],
  coreTruths?: CoreTruthsArtifact,
  transformationArc?: TransformationArtifact,
): MarketReport {
  const category = promise.category || "Business";
  const comparisonTitles: MarketReport["comparisonTitles"] = [
    {
      title: "The Advantage",
      author: "Patrick Lencioni",
      whyRelevant: "Strong organizational clarity and team-health positioning in the business category.",
      differenceOpportunity:
        "Lead more explicitly with the reader's modern pressure pattern and a sharper applied transformation.",
    },
    {
      title: "Thinking, Fast and Slow",
      author: "Daniel Kahneman",
      whyRelevant: "Credible anchor for decision-making and cognition in high-stakes environments.",
      differenceOpportunity:
        "Translate insight into a more immediately actionable operating model for the target reader.",
    },
    {
      title: "Competing in the Age of AI",
      author: "Marco Iansiti and Karim R. Lakhani",
      whyRelevant: "Touches adjacent enterprise strategy and AI-driven change themes.",
      differenceOpportunity:
        "Offer a more human, practical, and role-specific path through the same underlying turbulence.",
    },
  ];

  const directCompetitors = comparisonTitles.map((item) => ({
    ...item,
    credentials: "Established author with recognizable credibility in leadership, management, or strategy.",
    positioning: "Broad business nonfiction with strong credibility and category fit.",
    targetAudience: "Managers, leaders, and professionals looking for better decisions and execution.",
    strengths: [
      "Recognizable category authority",
      "Clear existing shelf placement",
    ],
    gaps: [
      "May not personalize the problem to this exact reader context",
      "Can leave room for a sharper mechanism or more current framing",
    ],
    estimatedSales: "Meaningful commercial precedent; exact public sales data should be treated as an estimate.",
    pricePoint: "Standard business-book pricing across hardcover, paperback, ebook, and audio.",
  }));

  const personaUrgency =
    personaContexts.length > 0
      ? personaContexts.map((persona) => ({
          personaName: persona.name,
          urgency: `${persona.name} feels active pressure because ${persona.dilemma.toLowerCase()}`,
          whyNow:
            "The current way of working is producing visible friction, so the reader is more likely to seek a practical answer now.",
        }))
      : [
          {
            personaName: promise.audiencePrimary || "Primary Reader",
            urgency:
              "The problem is painful enough to justify investment when the book shows a clear, practical payoff.",
            whyNow:
              "Current pressure and visible stakes make the old approach feel less sustainable.",
          },
        ];

  const coreTruth =
    coreTruths?.coreInsight.coreTruth ||
    promise.coreTruth ||
    "The reader needs a better operating model, not more generic pressure or motivation.";
  const transformedOutcome =
    transformationArc?.arc.completeTransformation ||
    promise.transformationAfter ||
    "A more effective, repeatable way to act and decide.";

  return {
    marketCategory: `${category} / practical transformation / ${promise.audiencePrimary || "professional readership"}`,
    comparisonTitles,
    saturationAssessment:
      "Moderately crowded category with room for differentiation if the book names a specific buyer, a sharper mechanism, and a more current problem pattern.",
    attractionDrivers: [
      "Clear reader pain and desire for practical progress",
      "Commercially familiar business-book category with proven buyer behavior",
      "A truth-and-transformation angle that can separate the book from generic advice",
    ],
    commercialRisks: [
      "The promise may still read as broad if the primary buyer and situation are not named tightly.",
      "A strong category requires a clearly defended wedge, not just better writing.",
      "Market estimates are only directional unless stronger external validation is collected.",
    ],
    recommendations: [
      "Keep the primary reader explicit and role-specific.",
      "Translate the truth into a distinct commercial mechanism readers can remember.",
      "Show how the book solves a more current or better-defined version of the problem than adjacent comps.",
    ],
    executiveSummary: {
      headline: `This book can compete in ${category.toLowerCase()} if it stays tightly anchored to a specific reader pain pattern and a differentiated practical mechanism.`,
      overallRecommendation: promise.differentiation ? "GO" : "CONDITIONAL_GO",
      rationale:
        "The category is viable, but the commercial outcome depends on how crisply the book names its buyer, wedge, and why-now relevance.",
      strategicPriority:
        "Sharpen the positioning around the clearest persona, strongest truth, and most defensible transformation.",
    },
    competitiveLandscape: {
      directCompetitors,
      indirectCompetitors: [
        {
          category: "Courses and cohort programs",
          examples: ["Leadership course", "Executive workshop", "Cohort-based accelerator"],
          currentAlternative:
            "Readers may choose structured programs when they want implementation help beyond a book.",
          spendProfile:
            "Higher cash spend than a book, but chosen when stakes are high and urgency is explicit.",
        },
        {
          category: "Coaching, consulting, and internal enablement",
          examples: ["Executive coach", "Consultant", "Internal playbook or training program"],
          currentAlternative:
            "Organizations often solve the problem through outside expertise or internal operating systems instead of reading.",
          spendProfile:
            "Can absorb larger budgets, which means the book should also serve as an entry point to premium offers.",
        },
      ],
      competitiveAdvantage: {
        differentiation:
          promise.differentiation ||
          coreTruth,
        unfairAdvantage:
          "The strongest advantage will come from combining a sharp reframe with applied credibility, voice, and persona specificity.",
        whoChoosesThisBook:
          "Readers who want a practical, credible, and more emotionally legible guide than generic category books or abstract strategy texts.",
        gapFilled:
          "A bridge between insight and action for readers who feel the problem acutely but do not want theory without implementation.",
      },
      marketPositioning: {
        academicToPractical: "Closer to practical than academic, with enough evidence to feel credible.",
        nicheToBroad: "Best positioned as focused enough to feel specific, broad enough to travel across adjacent professionals.",
        theoreticalToActionOriented: "Strongly action-oriented, using frameworks and examples rather than pure abstraction.",
        industrySpecificToUniversal:
          "Most effective when it starts with a concrete domain or role signal, then translates to adjacent readers.",
        whiteSpace:
          "The white space is a commercially sharp book that connects a fresh truth to a recognizable reader problem and immediate implementation path.",
      },
    },
    marketSizing: {
      totalAddressableMarket:
        "Broad professional development and business-reading audience globally, narrowed by the personas most likely to feel this problem intensely.",
      serviceableAddressableMarket:
        "A subset of that audience who actively buys business books, courses, and practical learning content.",
      serviceableObtainableMarket:
        "Year-one reach is most realistic through a mix of Amazon, direct audience, speaking, and selective partnerships rather than mass breakout assumptions.",
      yearOneToThreeOutlook:
        "Year 1 is about validating positioning and channel fit; Years 2-3 depend on compounding authority, speaking, bulk sales, and ecosystem offers.",
      trends:
        "Demand is strongest when the book speaks to current complexity, pressure, and the need for practical, confidence-building frameworks.",
      tailwinds: [
        "Ongoing appetite for practical business and leadership books",
        "Growing demand for frameworks that help people act amid uncertainty and overload",
        "A stronger monetization ecosystem around books than book-only revenue alone",
      ],
      headwinds: [
        "Crowded category with many adjacent claims",
        "Reader attention competition from faster and cheaper alternatives",
        "Breakout success depends heavily on platform and distribution, not just manuscript quality",
      ],
    },
    audienceDemand: {
      personaUrgency,
      searchBehavior: [
        "Searches that frame the pain as a live work problem, not just a learning topic",
        "Questions about how to lead, decide, prioritize, or operate better under pressure",
        "Comparisons between books, courses, frameworks, and expert guidance",
      ],
      contentConsumptionPatterns: [
        "Business books for synthesis and authority",
        "Podcasts, newsletters, and LinkedIn-style thought leadership for discovery",
        "Courses, communities, and workshops when implementation urgency increases",
      ],
      willingnessToPay:
        "Low-friction willingness to buy a book is plausible when the promise is specific; higher-ticket conversion depends on visible business value.",
      validationSignals:
        "The market signal is strongest when real readers confirm the problem, urgency, and willingness to try this exact framing.",
      openQuestions: [
        "Which persona is most likely to buy first without extensive education?",
        "Which comp titles are most often mentioned by actual target readers?",
        "What phrasing makes the book feel immediately relevant instead of broadly interesting?",
      ],
    },
    pricingStrategy: {
      comparableBookPricing:
        "Use standard business-book pricing bands and position the format mix to match category expectations.",
      costAnalysis:
        "The economic model should assume modest per-book margins and treat the book as both revenue stream and demand-generation asset.",
      pricingTiers: [
        {
          format: "Hardcover",
          pricePoint: "Premium business-book tier",
          rationale: "Best for leadership, gifting, and signal value at launch.",
        },
        {
          format: "Paperback",
          pricePoint: "Standard mass-market business-book tier",
          rationale: "Supports broader accessibility and longer-tail retail conversion.",
        },
        {
          format: "Ebook",
          pricePoint: "Lower-friction impulse tier",
          rationale: "Useful for discovery, portability, and promotional moments.",
        },
        {
          format: "Audiobook",
          pricePoint: "Premium convenience tier",
          rationale: "Important for professionals who consume learning content while commuting or multitasking.",
        },
      ],
      pricePositioning:
        "Price to signal professional value without making the book feel niche or inaccessible.",
      launchPricing:
        "A launch strategy can use short-term tactical pricing, but the core signal should still communicate authority and utility.",
    },
    monetizationEcosystem: {
      directBookRevenue:
        "Direct book sales are important, but the real upside often comes from how the book compounds trust and opens adjacent offers.",
      ancillaryProducts: [
        {
          channel: "Workbook",
          offer: "Templates, exercises, and guided implementation tools tied to the framework.",
          pricePoint: "Accessible add-on tier",
          revenuePotential: "Moderate; strongest when paired with book-driven implementation demand.",
        },
        {
          channel: "Course",
          offer: "Self-paced or cohort-based deepening of the book's mechanism and implementation path.",
          pricePoint: "Mid- to premium-tier offer",
          revenuePotential: "Higher than the book when authority and demand are validated.",
        },
        {
          channel: "Corporate training or licensing",
          offer: "Bulk books, workshops, and facilitated adoption inside teams or organizations.",
          pricePoint: "Premium organizational spend",
          revenuePotential: "Potentially high when the framework maps cleanly to team or enterprise outcomes.",
        },
      ],
      speakingAndAuthority:
        "A strong book can expand speaking invitations, keynote fees, and workshop demand if the topic ties to visible business outcomes.",
      consultingAndCoaching:
        "The book can function as trust-building top-of-funnel for coaching, advisory, or consulting engagements.",
      mediaAndLicensing:
        "Audio, foreign rights, and corporate licensing become more realistic after traction and proof of resonance.",
      contentAndCommunity:
        "Newsletter, podcast, and community layers increase reach and create recurring audience touchpoints beyond launch week.",
      totalEcosystemRevenueProjection:
        "The healthiest model treats the book as the anchor of a broader authority and offer ecosystem, not as a standalone revenue bet.",
    },
    distributionAndLaunch: {
      publishingOptions:
        "Choose between traditional, hybrid, or self-publishing based on the desired tradeoff between control, speed, distribution, and platform support.",
      distributionChannels: [
        "Amazon and core online retail",
        "Direct sales through website, email list, and speaking events",
        "Bulk and organizational channels for teams, associations, and corporate programs",
      ],
      launchStrategy:
        "Use a pre-launch audience build, a concentrated launch window, and a sustained post-launch rhythm tied to content, partnerships, and speaking.",
      marketingChannels: [
        "Owned channels such as email, website, and social content",
        "Earned channels such as podcasts, press, and partner appearances",
        "Strategic partnerships with aligned creators, organizations, and communities",
      ],
      yearOneDistributionMix:
        "Expect the most controllable early sales to come from direct audience and partner-driven channels, with retail compounding over time.",
    },
    riskAssessment: {
      overallRiskProfile: promise.differentiation ? "Medium" : "High",
      marketRisks: [
        "Category crowding can flatten the message if the wedge is not explicit.",
        "Trend-driven positioning can age poorly if it is too dependent on a passing narrative.",
      ],
      authorPlatformRisks: [
        "Limited existing audience makes launch distribution harder.",
        "Promotional consistency matters as much as book quality in early traction.",
      ],
      contentMessageRisks: [
        "The truth may feel too abstract if not anchored in concrete reader pain and proof.",
        "Competitors can sound similar unless the mechanism and audience are unmistakable.",
      ],
      economicTimingRisks: [
        "Budget pressure can reduce ancillary conversions even if book demand remains.",
        "Attention competition increases when buyers delay optional learning purchases.",
      ],
      executionRisks: [
        "Finishing the manuscript and executing launch well are separate risks.",
        "The ecosystem upside disappears if the book is never translated into offers and channels.",
      ],
      mitigationPlan: [
        "Validate messaging with real readers before locking the outline.",
        "Use the outline and launch plan to reinforce the same commercial wedge repeatedly.",
        "Treat the book as the start of a system, not the entire business model.",
      ],
      dealBreakers: [
        "If no persona feels urgent ownership of the problem, the book will struggle.",
        "If the promise cannot be differentiated from obvious comps, the go/no-go should be revisited.",
      ],
    },
    successMetrics: {
      yearOneGoals: [
        "A clear book sales target tied to the launch plan",
        "Audience growth across email and owned channels",
        "Early proof that the book creates speaking, consulting, or course demand",
      ],
      keyPerformanceIndicators: [
        "Units sold by channel",
        "Revenue by offer type",
        "Audience growth and engagement",
        "Review quality, endorsements, and speaking invitations",
      ],
      successDefinition:
        `A successful book proves ${coreTruth.toLowerCase()} in the market and creates repeatable demand for ${transformedOutcome.toLowerCase()}`,
      milestones: [
        "Pre-launch positioning validation and audience build",
        "Launch-window sales and visibility targets",
        "Post-launch channel, offer, and demand-compounding targets",
      ],
    },
    financialProjections: {
      yearOneRevenue:
        "Model a conservative, realistic, and optimistic case separately instead of relying on one blended assumption.",
      yearOneCosts:
        "Include writing, editing, design, production, launch, advertising, tooling, and distribution assumptions.",
      profitabilityAnalysis:
        "Profitability depends on channel mix and ancillary conversion, not just unit sales.",
      yearsTwoToThreeProjection:
        "Longer-tail growth is most likely when the book feeds speaking, training, consulting, and repeatable content channels.",
      sensitivityAnalysis:
        "Pressure-test the model against weaker sales, higher marketing spend, and slower ecosystem conversion.",
    },
    goNoGoRecommendation: {
      marketValidation:
        "The market is viable if target readers clearly recognize the problem and the promise sounds meaningfully different from the shelf.",
      competitivePosition:
        "The book can compete if it keeps the reader, wedge, and mechanism more explicit than adjacent comps.",
      businessModelViability:
        "The economics work best when the book is treated as a lead asset for a wider ecosystem.",
      personalFit:
        "Proceed only if the author can support both manuscript quality and sustained promotion.",
      overallRecommendation: promise.differentiation ? "GO" : "CONDITIONAL_GO",
      conditions: [
        "Tighten the primary persona and why-now framing.",
        "Carry the truth and transformation explicitly into the commercial positioning.",
        "Collect stronger real-world validation before overcommitting to optimistic assumptions.",
      ],
      nextSteps: [
        "Pressure-test the title, promise, and outline against the strongest comps.",
        "Interview or validate with real readers in the primary persona cluster.",
        "Draft a launch and channel plan before assuming large sales projections.",
      ],
    },
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: "fallback",
      tokenUsage: null,
      grounding: {
        previousPhases: ["Promise Statement"],
        audienceSignals: personaUrgency.map((item) => `${item.personaName}: ${item.urgency}`),
        kbSources: [],
      },
    },
  };
}

export function fallbackMarketReport(promise: PromiseBrief): MarketReport {
  return createFallbackMarketReport(
    promise,
    buildTruthPersonaContexts(promise, undefined, undefined),
  );
}
