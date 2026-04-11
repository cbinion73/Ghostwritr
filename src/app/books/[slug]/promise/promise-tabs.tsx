"use client";

import { useState } from "react";
import {
  savePromiseStatement,
  generatePromiseTemplate,
  validatePromise,
  refinePomiseWithAI,
  autoGeneratePersonasAction,
  autoOptimizeMarketAction,
  autoImprovePromiseAction,
} from "./actions";
import { ValidationDashboard } from "./validation-dashboard";
import type { PromiseBrief, PersonaPack, MarketReport, PositioningRecommendations } from "@/lib/promise-types";
import type { ValidationScores } from "@/lib/validation/promise-validator";

type TabName = "promise" | "audience" | "truth" | "transformation" | "market" | "recommendations";

interface PromiseTabsProps {
  slug: string;
  promise: PromiseBrief;
  personas: PersonaPack;
  market: MarketReport;
  recommendations: PositioningRecommendations;
}

export function PromiseTabs({
  slug,
  promise,
  personas,
  market,
  recommendations,
}: PromiseTabsProps) {
  const [activeTab, setActiveTab] = useState<TabName>("promise");
  const [editingPromise, setEditingPromise] = useState(promise.promiseStatement);
  const [validationScores, setValidationScores] = useState<ValidationScores | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const tabs: Array<{ id: TabName; label: string }> = [
    { id: "promise", label: "Promise" },
    { id: "audience", label: "Audience" },
    { id: "truth", label: "Truth" },
    { id: "transformation", label: "Transformation" },
    { id: "market", label: "Market" },
    { id: "recommendations", label: "Recommendations" },
  ];

  const handleSavePromise = async () => {
    await savePromiseStatement(slug, editingPromise);

    // Auto-validate after saving to show updated scores
    setTimeout(async () => {
      setIsValidating(true);
      try {
        const scores = await validatePromise(slug);
        setValidationScores(scores);
      } catch (error) {
        console.error("Auto-validation failed:", error);
      } finally {
        setIsValidating(false);
      }
    }, 300);
  };

  const handleGenerateTemplate = async () => {
    await generatePromiseTemplate(slug);

    // Auto-validate after generating template to show initial scores
    setTimeout(async () => {
      setIsValidating(true);
      try {
        const scores = await validatePromise(slug);
        setValidationScores(scores);
      } catch (error) {
        console.error("Auto-validation failed:", error);
      } finally {
        setIsValidating(false);
      }
    }, 500); // Small delay to ensure template is persisted
  };

  const handleValidatePromise = async () => {
    setIsValidating(true);
    try {
      const scores = await validatePromise(slug);
      setValidationScores(scores);
    } catch (error) {
      console.error("Validation failed:", error);
    } finally {
      setIsValidating(false);
    }
  };

  const handleRefinePromise = async () => {
    if (!validationScores) {
      alert("Please validate the promise first to get refinement suggestions");
      return;
    }

    setIsRefining(true);
    try {
      // Extract all gaps - both issues and suggestions
      const allFeedback = [
        ...validationScores.personaMatch.feedback,
        ...validationScores.marketViability.feedback,
        ...validationScores.promiseQuality.feedback,
        ...validationScores.triangulation.gaps,
        ...validationScores.triangulation.suggestions,
      ];

      console.log("[handleRefinePromise] Starting refinement with gaps:", allFeedback);

      const refined = await refinePomiseWithAI(slug, editingPromise, allFeedback);

      console.log("[handleRefinePromise] Refinement complete. Original length:", editingPromise.length, "Refined length:", refined.length);

      if (refined && refined !== editingPromise) {
        setEditingPromise(refined);
        console.log("[handleRefinePromise] Promise updated successfully");
        alert("✓ Promise refined! Review changes and click Save Promise.");
      } else if (refined === editingPromise) {
        console.log("[handleRefinePromise] Refined text same as original");
        alert("Promise is already strong. Check the score details for specific improvements needed.");
      } else {
        console.log("[handleRefinePromise] Refined text is empty");
        alert("Could not refine promise. Check console for details.");
      }
    } catch (error) {
      console.error("[handleRefinePromise] Refinement failed:", error);
      alert("Failed to refine promise. Check browser console (F12) for error details.");
    } finally {
      setIsRefining(false);
    }
  };

  const handleAutoOptimize = async (type: "personas" | "market" | "promise") => {
    setIsOptimizing(true);
    try {
      if (type === "promise") {
        const improved = await autoImprovePromiseAction(slug);
        setEditingPromise(improved);
        alert("✓ Promise auto-improved! Click Save Promise to apply.");
      } else if (type === "personas") {
        const personas = await autoGeneratePersonasAction(slug);
        console.log("Generated personas:", personas);
        alert("✓ Personas auto-generated! Validate again to see updated scores.");
      } else if (type === "market") {
        const market = await autoOptimizeMarketAction(slug);
        console.log("Optimized market analysis:", market);
        alert("✓ Market analysis optimized! Validate again to see updated scores.");
      }

      // Re-validate after optimization
      setTimeout(async () => {
        try {
          const scores = await validatePromise(slug);
          setValidationScores(scores);
        } catch (error) {
          console.error("Re-validation failed:", error);
        }
      }, 500);
    } catch (error) {
      console.error("Optimization failed:", error);
      alert(`Failed to optimize ${type}. Try again.`);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Tabs */}
      <div style={styles.tabsBar}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {activeTab === "promise" && (
          <div style={styles.tabContent}>
            <h2 style={styles.title}>Final Book Promise</h2>

            {validationScores && (
              <ValidationDashboard
                scores={validationScores}
                onAutoOptimize={handleAutoOptimize}
                isOptimizing={isOptimizing}
              />
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSavePromise();
              }}
              style={styles.form}
            >
              <textarea
                value={editingPromise}
                onChange={(e) => setEditingPromise(e.target.value)}
                style={styles.textarea}
              />
              <div style={styles.buttonGroup}>
                <button
                  type="button"
                  onClick={handleGenerateTemplate}
                  style={styles.secondaryButton}
                >
                  Generate Template
                </button>
                <button
                  type="button"
                  onClick={handleValidatePromise}
                  disabled={isValidating}
                  style={{
                    ...styles.secondaryButton,
                    ...(isValidating && styles.disabledButton),
                  }}
                >
                  {isValidating ? "Validating..." : "Validate Promise"}
                </button>
                <button
                  type="button"
                  onClick={handleRefinePromise}
                  disabled={isRefining || !validationScores}
                  style={{
                    ...styles.secondaryButton,
                    ...(isRefining || !validationScores ? styles.disabledButton : {}),
                  }}
                >
                  {isRefining ? "Refining..." : "Refine with AI"}
                </button>
                <button type="submit" style={styles.saveButton}>
                  Save Promise
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === "audience" && (
          <div style={styles.tabContent}>
            <h2 style={styles.title}>Audience & Personas</h2>

            {/* Primary Audience */}
            <h3 style={styles.subtitle}>Primary Audience</h3>
            {promise.audiencePrimary ? (
              <p style={styles.text}>{promise.audiencePrimary}</p>
            ) : (
              <p style={styles.text}>Primary audience will appear here as you refine the promise.</p>
            )}

            {/* Secondary Audiences */}
            {promise.audienceSecondary && promise.audienceSecondary.length > 0 && (
              <>
                <h3 style={styles.subtitle}>Secondary Audiences</h3>
                <ul style={styles.list}>
                  {promise.audienceSecondary.map((aud, i) => (
                    <li key={i} style={styles.listItem}>
                      {aud}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Reader Personas */}
            <h3 style={styles.subtitle}>Reader Personas</h3>
            {personas?.personas && personas.personas.length > 0 ? (
              <div style={styles.personas}>
                {personas.personas.map((persona) => (
                  <div key={persona.id} style={styles.personaCard}>
                    <h3 style={styles.personaName}>
                      {persona.name}
                      <span style={styles.personaPriority}>
                        {persona.priority === "primary" ? "Primary" : "Secondary"}
                      </span>
                    </h3>
                    <p style={styles.personaContext}>{persona.context}</p>

                    {persona.painPoints.length > 0 && (
                      <>
                        <h4 style={styles.personaSubheading}>Pain Points</h4>
                        <ul style={styles.personaList}>
                          {persona.painPoints.map((point, i) => (
                            <li key={i}>{point}</li>
                          ))}
                        </ul>
                      </>
                    )}

                    {persona.desiredOutcomes.length > 0 && (
                      <>
                        <h4 style={styles.personaSubheading}>Desired Outcomes</h4>
                        <ul style={styles.personaList}>
                          {persona.desiredOutcomes.map((outcome, i) => (
                            <li key={i}>{outcome}</li>
                          ))}
                        </ul>
                      </>
                    )}

                    {persona.languageCues && persona.languageCues.length > 0 && (
                      <>
                        <h4 style={styles.personaSubheading}>Language Cues</h4>
                        <p style={styles.text}>{persona.languageCues.join(", ")}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={styles.text}>Personas will appear here as you refine the promise.</p>
            )}
          </div>
        )}

        {activeTab === "truth" && (
          <div style={styles.tabContent}>
            <h2 style={styles.title}>Core Truth</h2>
            {promise.coreTruth ? (
              <>
                <p style={styles.text}>{promise.coreTruth}</p>
                {promise.readerProblem && (
                  <>
                    <h3 style={styles.subtitle}>Reader Problem</h3>
                    <p style={styles.text}>{promise.readerProblem}</p>
                  </>
                )}
                {promise.readerDesire && (
                  <>
                    <h3 style={styles.subtitle}>Reader Desire</h3>
                    <p style={styles.text}>{promise.readerDesire}</p>
                  </>
                )}
              </>
            ) : (
              <p style={styles.text}>Core truth information will appear here as you refine the promise.</p>
            )}
          </div>
        )}

        {activeTab === "transformation" && (
          <div style={styles.tabContent}>
            <h2 style={styles.title}>Transformation</h2>
            {promise.transformationBefore && promise.transformationAfter ? (
              <div style={styles.transformationBox}>
                <div style={styles.transformationPart}>
                  <h3 style={styles.subtitle}>From</h3>
                  <p style={styles.text}>{promise.transformationBefore}</p>
                </div>
                <div style={styles.arrow}>→</div>
                <div style={styles.transformationPart}>
                  <h3 style={styles.subtitle}>To</h3>
                  <p style={styles.text}>{promise.transformationAfter}</p>
                </div>
              </div>
            ) : (
              <p style={styles.text}>Transformation will appear here as you refine the promise.</p>
            )}
          </div>
        )}

        {activeTab === "market" && (
          <div style={styles.tabContent}>
            <h2 style={styles.title}>Market Analysis</h2>
            {market ? (
            <div style={styles.marketSection}>
              <h3 style={styles.subtitle}>Category</h3>
              <p style={styles.text}>{market.marketCategory || "—"}</p>

              <h3 style={styles.subtitle}>Comparable Titles</h3>
              <div style={styles.comparables}>
                {market.comparisonTitles.map((comp, i) => (
                  <div key={i} style={styles.comparable}>
                    <strong>{comp.title}</strong> by {comp.author}
                    <p style={styles.mutedText}>{comp.whyRelevant}</p>
                    <p style={styles.mutedText}>
                      <strong>Difference opportunity:</strong> {comp.differenceOpportunity}
                    </p>
                  </div>
                ))}
              </div>

              {market.attractionDrivers.length > 0 && (
                <>
                  <h3 style={styles.subtitle}>Market Drivers</h3>
                  <ul style={styles.list}>
                    {market.attractionDrivers.map((driver, i) => (
                      <li key={i} style={styles.listItem}>
                        {driver}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {market.commercialRisks.length > 0 && (
                <>
                  <h3 style={styles.subtitle}>Commercial Risks</h3>
                  <ul style={styles.riskList}>
                    {market.commercialRisks.map((risk, i) => (
                      <li key={i} style={styles.riskItem}>
                        {risk}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            ) : (
              <p style={styles.text}>Market analysis will appear here as you refine the promise.</p>
            )}
          </div>
        )}

        {activeTab === "recommendations" && (
          <div style={styles.tabContent}>
            <h2 style={styles.title}>Positioning Recommendations</h2>
            {recommendations ? (
              <>
            <div style={styles.summaryBox}>
              <p style={styles.summaryText}>{recommendations.summary || "—"}</p>
            </div>

            {recommendations.recommendations && recommendations.recommendations.length > 0 && (
              <>
                <h3 style={styles.subtitle}>Key Recommendations</h3>
                <ul style={styles.list}>
                  {recommendations.recommendations.map((rec, i) => (
                    <li key={i} style={styles.listItem}>
                      {rec}
                    </li>
                  ))}
                </ul>
              </>
            )}
              </>
            ) : (
              <p style={styles.text}>Positioning recommendations will appear here as you refine the promise.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    backgroundColor: "var(--panel, #fefbf5)",
  },
  tabsBar: {
    display: "flex",
    gap: "8px",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(45, 36, 29, 0.1)",
    backgroundColor: "var(--paper, #fbf6ef)",
    overflowX: "auto" as const,
    flexShrink: 0,
  },
  tab: {
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: "none",
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    color: "var(--muted, #6f6256)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
    whiteSpace: "nowrap" as const,
  },
  tabActive: {
    color: "var(--accent, #16384f)",
    borderBottomColor: "var(--accent, #16384f)",
  },
  content: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "32px",
    display: "flex" as const,
    flexDirection: "column" as const,
  },
  tabContent: {
    maxWidth: "900px",
    margin: "0 auto",
    display: "flex" as const,
    flexDirection: "column" as const,
    flex: 1,
    width: "100%",
  },
  title: {
    margin: "0 0 24px",
    fontSize: "28px",
    fontWeight: 600,
    color: "var(--ink, #2d241d)",
  },
  subtitle: {
    margin: "24px 0 12px",
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--ink, #2d241d)",
  },
  text: {
    margin: "12px 0",
    fontSize: "15px",
    lineHeight: 1.8,
    color: "var(--ink, #2d241d)",
  },
  mutedText: {
    fontSize: "13px",
    color: "var(--muted, #6f6256)",
    lineHeight: 1.6,
  },
  form: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "16px",
    flex: 1,
  },
  textarea: {
    padding: "24px",
    borderRadius: "8px",
    border: "2px solid rgba(45, 36, 29, 0.1)",
    fontFamily: "inherit",
    fontSize: "18px",
    lineHeight: 1.8,
    flex: 1,
    resize: "none" as const,
    color: "var(--ink, #2d241d)",
  },
  buttonGroup: {
    display: "flex" as const,
    gap: "12px",
    alignItems: "center",
    flexWrap: "wrap" as const,
  },
  saveButton: {
    padding: "12px 24px",
    backgroundColor: "var(--accent, #16384f)",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    width: "fit-content",
  },
  secondaryButton: {
    padding: "12px 24px",
    backgroundColor: "transparent",
    color: "var(--accent, #16384f)",
    border: "2px solid var(--accent, #16384f)",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    width: "fit-content",
  } as const,
  disabledButton: {
    opacity: 0.6,
    cursor: "not-allowed",
  } as const,
  list: {
    margin: "12px 0",
    paddingLeft: "20px",
  },
  listItem: {
    lineHeight: 1.8,
    fontSize: "14px",
  },
  riskList: {
    margin: "12px 0",
    paddingLeft: "20px",
  },
  riskItem: {
    lineHeight: 1.8,
    fontSize: "14px",
    color: "#c92a2a",
  },
  transformationBox: {
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    gap: "24px",
    alignItems: "center",
    marginTop: "24px",
    padding: "24px",
    backgroundColor: "var(--paper, #fbf6ef)",
    borderRadius: "8px",
  },
  transformationPart: {
    display: "grid",
    gap: "8px",
  },
  arrow: {
    fontSize: "24px",
    fontWeight: "bold",
    color: "var(--accent, #16384f)",
    textAlign: "center" as const,
  },
  personas: {
    display: "grid",
    gap: "20px",
    marginTop: "20px",
  },
  personaCard: {
    padding: "20px",
    backgroundColor: "var(--paper, #fbf6ef)",
    borderRadius: "8px",
    borderLeft: "4px solid var(--accent, #16384f)",
  },
  personaName: {
    margin: "0 0 8px",
    fontSize: "16px",
    fontWeight: 600,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  personaPriority: {
    fontSize: "12px",
    fontWeight: 400,
    color: "var(--muted, #6f6256)",
    backgroundColor: "rgba(139, 109, 50, 0.1)",
    padding: "2px 8px",
    borderRadius: "4px",
  },
  personaContext: {
    margin: "0 0 16px",
    fontSize: "14px",
    lineHeight: 1.6,
    color: "var(--muted, #6f6256)",
  },
  personaSubheading: {
    margin: "12px 0 8px",
    fontSize: "13px",
    fontWeight: 600,
    color: "var(--ink, #2d241d)",
  },
  personaList: {
    margin: "0 0 12px",
    paddingLeft: "16px",
  },
  marketSection: {
    display: "grid",
    gap: "20px",
  },
  comparables: {
    display: "grid",
    gap: "16px",
    marginTop: "12px",
  },
  comparable: {
    padding: "16px",
    backgroundColor: "var(--paper, #fbf6ef)",
    borderRadius: "6px",
  },
  summaryBox: {
    padding: "20px",
    backgroundColor: "var(--paper, #fbf6ef)",
    borderRadius: "8px",
    borderLeft: "4px solid var(--gold, #8f6d32)",
    marginTop: "16px",
  },
  summaryText: {
    margin: 0,
    fontSize: "15px",
    lineHeight: 1.8,
    color: "var(--ink, #2d241d)",
  },
};
