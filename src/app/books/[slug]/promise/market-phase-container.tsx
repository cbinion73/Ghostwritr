"use client";

import { useEffect, useState } from "react";
import type { MarketReport } from "@/lib/promise-types";
import { ApprovalButtons, type ApprovalStatus } from "./approval-buttons";
import { generateMarketAnalysisAction } from "./actions";
import { MarketPositioningChart } from "./market-positioning-chart";

interface MarketPhaseContainerProps {
  slug: string;
  title: string;
  data?: MarketReport;
  isGenerating?: boolean;
  approvalStatus?: ApprovalStatus;
  approvalFeedback?: string;
  onApprove: (sectionId: string) => void;
  onReject: (sectionId: string, feedback: string) => void;
  onRegenerate: (sectionId: string) => void;
  onDataChange?: (data: MarketReport) => void;
}

function formatDecisionLabel(value: "GO" | "NO_GO" | "CONDITIONAL_GO"): string {
  return value.replace(/_/g, " ");
}

export default function MarketPhaseContainer({
  slug,
  title,
  data,
  isGenerating = false,
  approvalStatus = "pending",
  approvalFeedback,
  onApprove,
  onReject,
  onRegenerate,
  onDataChange,
}: MarketPhaseContainerProps) {
  const [marketData, setMarketData] = useState<MarketReport | undefined>(data);
  const [localIsGenerating, setLocalIsGenerating] = useState(isGenerating);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoTriggered, setHasAutoTriggered] = useState(false);
  const needsRegeneration =
    !marketData || !marketData.metadata?.model?.toLowerCase().includes("gemini");

  useEffect(() => {
    setMarketData(data);
  }, [data]);

  useEffect(() => {
    setLocalIsGenerating(isGenerating);
  }, [isGenerating]);

  const handleGenerate = async () => {
    setLocalIsGenerating(true);
    setError(null);
    try {
      const generated = await generateMarketAnalysisAction(slug);
      setMarketData(generated);
      onDataChange?.(generated);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate market analysis",
      );
    } finally {
      setLocalIsGenerating(false);
    }
  };

  useEffect(() => {
    if (needsRegeneration && !localIsGenerating && !hasAutoTriggered) {
      setHasAutoTriggered(true);
      void handleGenerate();
    }
  }, [needsRegeneration, localIsGenerating, hasAutoTriggered]);

  const styles = {
    container: {
      display: "grid" as const,
      gap: "24px",
      padding: "24px",
    },
    header: {
      display: "grid" as const,
      gap: "12px",
    },
    title: {
      fontSize: "20px",
      fontWeight: 700,
      color: "#2d241d",
      margin: 0,
    },
    description: {
      fontSize: "14px",
      color: "#6f6256",
      margin: 0,
      lineHeight: 1.6,
    },
    errorBox: {
      padding: "12px 14px",
      backgroundColor: "#fee2e2",
      border: "1px solid #fecaca",
      borderRadius: "8px",
      color: "#991b1b",
      fontSize: "14px",
    },
    highlightBox: {
      padding: "20px",
      backgroundColor: "rgba(22, 56, 79, 0.06)",
      border: "1px solid rgba(22, 56, 79, 0.16)",
      borderRadius: "12px",
      display: "grid" as const,
      gap: "12px",
    },
    highlightText: {
      fontSize: "18px",
      fontWeight: 700,
      color: "#16384f",
      lineHeight: 1.55,
      margin: 0,
    },
    metaRow: {
      display: "flex" as const,
      flexWrap: "wrap" as const,
      gap: "10px",
      alignItems: "center" as const,
    },
    badge: {
      display: "inline-flex",
      alignItems: "center" as const,
      padding: "6px 10px",
      borderRadius: "999px",
      fontSize: "12px",
      fontWeight: 700,
      backgroundColor: "rgba(245, 158, 11, 0.12)",
      border: "1px solid rgba(245, 158, 11, 0.24)",
      color: "#92400e",
    },
    groundingBox: {
      padding: "18px",
      backgroundColor: "rgba(22, 163, 74, 0.05)",
      border: "1px solid rgba(22, 163, 74, 0.18)",
      borderRadius: "12px",
      display: "grid" as const,
      gap: "14px",
    },
    sectionCard: {
      padding: "20px",
      backgroundColor: "rgba(255, 255, 255, 0.65)",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      borderRadius: "12px",
      display: "grid" as const,
      gap: "16px",
    },
    sectionTitle: {
      fontSize: "16px",
      fontWeight: 700,
      color: "#2d241d",
      margin: 0,
    },
    sectionGrid: {
      display: "grid" as const,
      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      gap: "16px",
    },
    subsection: {
      display: "grid" as const,
      gap: "6px",
    },
    label: {
      fontSize: "11px",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      color: "#6f6256",
      letterSpacing: "0.04em",
      margin: 0,
    },
    text: {
      fontSize: "14px",
      color: "#2d241d",
      lineHeight: 1.7,
      margin: 0,
    },
    list: {
      margin: 0,
      paddingLeft: "18px",
      display: "grid" as const,
      gap: "6px",
    },
    listItem: {
      fontSize: "14px",
      color: "#2d241d",
      lineHeight: 1.6,
    },
    cardGrid: {
      display: "grid" as const,
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      gap: "16px",
    },
    competitorCard: {
      padding: "18px",
      borderRadius: "12px",
      backgroundColor: "rgba(22, 56, 79, 0.04)",
      border: "1px solid rgba(22, 56, 79, 0.14)",
      display: "grid" as const,
      gap: "12px",
    },
    competitorTitle: {
      fontSize: "15px",
      fontWeight: 700,
      color: "#16384f",
      margin: 0,
    },
    muted: {
      fontSize: "13px",
      color: "#6f6256",
      lineHeight: 1.6,
      margin: 0,
    },
    approvalSection: {
      display: "grid" as const,
      gap: "16px",
      padding: "16px",
      backgroundColor: "rgba(255, 255, 255, 0.5)",
      borderRadius: "12px",
      border: "1px solid rgba(59, 44, 31, 0.12)",
    },
    placeholderBox: {
      padding: "24px",
      backgroundColor: "rgba(59, 44, 31, 0.04)",
      border: "2px dashed rgba(59, 44, 31, 0.2)",
      borderRadius: "12px",
      textAlign: "center" as const,
    },
    placeholderText: {
      fontSize: "14px",
      color: "rgba(59, 44, 31, 0.6)",
      fontStyle: "italic" as const,
      margin: 0,
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Market Analysis</h2>
        <p style={styles.description}>
          Gemini evaluates the book's commercial reality using the promise, personas, TRUTH, transformation arc, and knowledge base so this phase stays downstream of the work we already completed.
        </p>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {marketData ? (
        <>
          <div style={styles.highlightBox}>
            <p style={styles.highlightText}>{marketData.executiveSummary.headline}</p>
            <div style={styles.metaRow}>
              <span style={styles.badge}>
                {formatDecisionLabel(marketData.executiveSummary.overallRecommendation)}
              </span>
              <span style={styles.text}>{marketData.executiveSummary.strategicPriority}</span>
            </div>
            <p style={styles.text}>{marketData.executiveSummary.rationale}</p>
          </div>

          <div style={styles.groundingBox}>
            <h3 style={styles.sectionTitle}>Grounded By</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Previous Phases</p>
                <ul style={styles.list}>
                  {(marketData.metadata?.grounding?.previousPhases ?? []).map((item) => (
                    <li key={item} style={styles.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Audience Signals Used</p>
                <ul style={styles.list}>
                  {(marketData.metadata?.grounding?.audienceSignals ?? []).map((item) => (
                    <li key={item} style={styles.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Knowledge Base Sources</p>
                <ul style={styles.list}>
                  {(marketData.metadata?.grounding?.kbSources ?? []).map((item) => (
                    <li key={item} style={styles.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Competitive Landscape</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Market Category</p>
                <p style={styles.text}>{marketData.marketCategory}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Saturation Assessment</p>
                <p style={styles.text}>{marketData.saturationAssessment}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>White Space</p>
                <p style={styles.text}>
                  {marketData.competitiveLandscape.marketPositioning.whiteSpace}
                </p>
              </div>
            </div>

            <MarketPositioningChart
              yourBook={{
                title,
                x: 72,
                y: 58,
              }}
              competitors={marketData.comparisonTitles.map((comp) => ({
                title: comp.title,
                author: comp.author,
                x: 48,
                y: 52,
              }))}
            />

            <div style={styles.cardGrid}>
              {marketData.competitiveLandscape.directCompetitors.map((competitor) => (
                <div
                  key={`${competitor.title}-${competitor.author}`}
                  style={styles.competitorCard}
                >
                  <div>
                    <p style={styles.competitorTitle}>{competitor.title}</p>
                    <p style={styles.muted}>{competitor.author}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Positioning</p>
                    <p style={styles.text}>{competitor.positioning}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Gap We Can Own</p>
                    <p style={styles.text}>{competitor.differenceOpportunity}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Strengths</p>
                    <ul style={styles.list}>
                      {competitor.strengths.map((item) => (
                        <li key={item} style={styles.listItem}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Differentiation</p>
                <p style={styles.text}>
                  {marketData.competitiveLandscape.competitiveAdvantage.differentiation}
                </p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Unfair Advantage</p>
                <p style={styles.text}>
                  {marketData.competitiveLandscape.competitiveAdvantage.unfairAdvantage}
                </p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Who Chooses This Book</p>
                <p style={styles.text}>
                  {marketData.competitiveLandscape.competitiveAdvantage.whoChoosesThisBook}
                </p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Gap Filled</p>
                <p style={styles.text}>
                  {marketData.competitiveLandscape.competitiveAdvantage.gapFilled}
                </p>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Market Size & Audience Demand</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>TAM</p>
                <p style={styles.text}>{marketData.marketSizing.totalAddressableMarket}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>SAM</p>
                <p style={styles.text}>{marketData.marketSizing.serviceableAddressableMarket}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>SOM</p>
                <p style={styles.text}>{marketData.marketSizing.serviceableObtainableMarket}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Year 1-3 Outlook</p>
                <p style={styles.text}>{marketData.marketSizing.yearOneToThreeOutlook}</p>
              </div>
            </div>

            <div style={styles.cardGrid}>
              {marketData.audienceDemand.personaUrgency.map((persona) => (
                <div key={persona.personaName} style={styles.competitorCard}>
                  <p style={styles.competitorTitle}>{persona.personaName}</p>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Urgency</p>
                    <p style={styles.text}>{persona.urgency}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Why Now</p>
                    <p style={styles.text}>{persona.whyNow}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Search Behavior</p>
                <ul style={styles.list}>
                  {marketData.audienceDemand.searchBehavior.map((item) => (
                    <li key={item} style={styles.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Content Consumption</p>
                <ul style={styles.list}>
                  {marketData.audienceDemand.contentConsumptionPatterns.map((item) => (
                    <li key={item} style={styles.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Validation Signals</p>
                <p style={styles.text}>{marketData.audienceDemand.validationSignals}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Willingness To Pay</p>
                <p style={styles.text}>{marketData.audienceDemand.willingnessToPay}</p>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Pricing, Monetization & Launch</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Comparable Pricing</p>
                <p style={styles.text}>{marketData.pricingStrategy.comparableBookPricing}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Price Positioning</p>
                <p style={styles.text}>{marketData.pricingStrategy.pricePositioning}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Launch Pricing</p>
                <p style={styles.text}>{marketData.pricingStrategy.launchPricing}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Direct Book Revenue</p>
                <p style={styles.text}>{marketData.monetizationEcosystem.directBookRevenue}</p>
              </div>
            </div>

            <div style={styles.cardGrid}>
              {marketData.pricingStrategy.pricingTiers.map((tier) => (
                <div key={tier.format} style={styles.competitorCard}>
                  <p style={styles.competitorTitle}>{tier.format}</p>
                  <p style={styles.text}>{tier.pricePoint}</p>
                  <p style={styles.muted}>{tier.rationale}</p>
                </div>
              ))}
            </div>

            <div style={styles.cardGrid}>
              {marketData.monetizationEcosystem.ancillaryProducts.map((product) => (
                <div key={`${product.channel}-${product.offer}`} style={styles.competitorCard}>
                  <p style={styles.competitorTitle}>{product.channel}</p>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Offer</p>
                    <p style={styles.text}>{product.offer}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Price Point</p>
                    <p style={styles.text}>{product.pricePoint}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Revenue Potential</p>
                    <p style={styles.text}>{product.revenuePotential}</p>
                  </div>
                </div>
              ))}
            </div>

            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Publishing Options</p>
                <p style={styles.text}>{marketData.distributionAndLaunch.publishingOptions}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Launch Strategy</p>
                <p style={styles.text}>{marketData.distributionAndLaunch.launchStrategy}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Distribution Mix</p>
                <p style={styles.text}>
                  {marketData.distributionAndLaunch.yearOneDistributionMix}
                </p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Total Ecosystem Projection</p>
                <p style={styles.text}>
                  {marketData.monetizationEcosystem.totalEcosystemRevenueProjection}
                </p>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Risk, KPIs & Recommendation</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Overall Risk Profile</p>
                <p style={styles.text}>{marketData.riskAssessment.overallRiskProfile}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Success Definition</p>
                <p style={styles.text}>{marketData.successMetrics.successDefinition}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Year 1 Revenue</p>
                <p style={styles.text}>{marketData.financialProjections.yearOneRevenue}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Profitability</p>
                <p style={styles.text}>{marketData.financialProjections.profitabilityAnalysis}</p>
              </div>
            </div>

            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Commercial Risks</p>
                <ul style={styles.list}>
                  {marketData.commercialRisks.map((item) => (
                    <li key={item} style={styles.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Mitigation Plan</p>
                <ul style={styles.list}>
                  {marketData.riskAssessment.mitigationPlan.map((item) => (
                    <li key={item} style={styles.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Year 1 Goals</p>
                <ul style={styles.list}>
                  {marketData.successMetrics.yearOneGoals.map((item) => (
                    <li key={item} style={styles.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>KPIs</p>
                <ul style={styles.list}>
                  {marketData.successMetrics.keyPerformanceIndicators.map((item) => (
                    <li key={item} style={styles.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div style={styles.highlightBox}>
              <div style={styles.metaRow}>
                <span style={styles.badge}>
                  {formatDecisionLabel(marketData.goNoGoRecommendation.overallRecommendation)}
                </span>
              </div>
              <p style={styles.text}>{marketData.goNoGoRecommendation.marketValidation}</p>
              <p style={styles.text}>{marketData.goNoGoRecommendation.competitivePosition}</p>
              <p style={styles.text}>{marketData.goNoGoRecommendation.businessModelViability}</p>
              <div style={styles.sectionGrid}>
                <div style={styles.subsection}>
                  <p style={styles.label}>Conditions</p>
                  <ul style={styles.list}>
                    {marketData.goNoGoRecommendation.conditions.map((item) => (
                      <li key={item} style={styles.listItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div style={styles.subsection}>
                  <p style={styles.label}>Next Steps</p>
                  <ul style={styles.list}>
                    {marketData.goNoGoRecommendation.nextSteps.map((item) => (
                      <li key={item} style={styles.listItem}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={styles.placeholderBox}>
          <p style={styles.placeholderText}>
            Market analysis will auto-generate here once this phase opens.
          </p>
        </div>
      )}

      <div style={styles.approvalSection}>
        <ApprovalButtons
          sectionId="market"
          status={approvalStatus}
          feedback={approvalFeedback}
          onApprove={onApprove}
          onReject={onReject}
          onRegenerate={onRegenerate}
          isLoading={localIsGenerating}
        />
      </div>
    </div>
  );
}
