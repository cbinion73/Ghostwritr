"use client";

import { useState } from "react";
import type { ValidationScores } from "@/lib/validation/promise-validator";
import { refinePromiseWithIntelligentAgents, saveValidatedPersonas } from "./actions";

interface ValidationDashboardProps {
  scores: ValidationScores;
  slug?: string;
  geminiInsights?: {
    comparableBooks: Array<{ title: string; author: string }>;
    marketSize: string;
    marketGrowthSignals: string;
    commercialViability: string;
  };
  onAutoOptimize?: (type: "personas" | "market" | "promise") => void;
  isOptimizing?: boolean;
}

const styles = {
  dashboard: {
    display: "grid" as const,
    gap: "24px",
    padding: "24px",
    backgroundColor: "var(--panel, #fefbf5)",
    borderRadius: "8px",
    marginBottom: "24px",
  },
  header: {
    display: "flex" as const,
    alignItems: "center",
    gap: "16px",
    marginBottom: "16px",
  },
  title: {
    margin: 0,
    fontSize: "20px",
    fontWeight: 600,
    color: "var(--ink, #2d241d)",
  },
  statusBadge: {
    padding: "8px 16px",
    borderRadius: "20px",
    fontSize: "13px",
    fontWeight: 500,
  },
  statusReady: {
    backgroundColor: "#d4edda",
    color: "#155724",
  },
  statusWork: {
    backgroundColor: "#fff3cd",
    color: "#856404",
  },
  scoresGrid: {
    display: "grid" as const,
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "16px",
  },
  scoreCard: {
    padding: "16px",
    backgroundColor: "white",
    borderRadius: "8px",
    border: "2px solid rgba(45, 36, 29, 0.1)",
  },
  scoreTitle: {
    margin: "0 0 12px",
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--ink, #2d241d)",
  },
  scoreDisplay: {
    display: "flex" as const,
    alignItems: "baseline",
    gap: "8px",
    marginBottom: "12px",
  },
  scoreNumber: {
    fontSize: "32px",
    fontWeight: 700,
  },
  scoreLabel: {
    fontSize: "13px",
    color: "var(--muted, #6f6256)",
  },
  scoreBar: {
    width: "100%",
    height: "8px",
    backgroundColor: "rgba(45, 36, 29, 0.1)",
    borderRadius: "4px",
    overflow: "hidden" as const,
    marginBottom: "12px",
  },
  scoreFill: {
    height: "100%",
    backgroundColor: "var(--accent, #16384f)",
    transition: "width 0.3s ease",
  },
  breakdown: {
    fontSize: "12px",
    display: "grid" as const,
    gap: "6px",
  },
  breakdownItem: {
    display: "grid" as const,
    gridTemplateColumns: "1fr auto",
    gap: "8px",
    fontSize: "12px",
    color: "var(--ink, #2d241d)",
  },
  breakdownLabel: {
    color: "var(--muted, #6f6256)",
  },
  feedback: {
    display: "grid" as const,
    gap: "8px",
    marginTop: "12px",
    paddingTop: "12px",
    borderTop: "1px solid rgba(45, 36, 29, 0.1)",
  },
  feedbackItem: {
    fontSize: "13px",
    lineHeight: 1.5,
    color: "var(--ink, #2d241d)",
  },
  triangulation: {
    padding: "16px",
    backgroundColor: "#f8f6f1",
    borderRadius: "8px",
    borderLeft: "4px solid var(--accent, #16384f)",
  },
  triangulationTitle: {
    margin: "0 0 12px",
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--ink, #2d241d)",
  },
  gaps: {
    marginBottom: "12px",
  },
  gapTitle: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#d9534f",
    marginBottom: "6px",
  },
  gapList: {
    margin: 0,
    paddingLeft: "20px",
    fontSize: "13px",
  },
  gapItem: {
    color: "#d9534f",
    marginBottom: "4px",
  },
  suggestions: {
    marginBottom: "12px",
  },
  suggestionTitle: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#5cb85c",
    marginBottom: "6px",
  },
  suggestionList: {
    margin: 0,
    paddingLeft: "20px",
    fontSize: "13px",
  },
  suggestionItem: {
    color: "#5cb85c",
    marginBottom: "4px",
  },
  insightsSection: {
    padding: "20px",
    backgroundColor: "#f0f4f8",
    borderRadius: "8px",
    marginTop: "24px",
    borderLeft: "4px solid #0066cc",
  },
  insightsTitle: {
    margin: "0 0 16px",
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--ink, #2d241d)",
  },
  insightCategory: {
    marginBottom: "16px",
  },
  insightCategoryTitle: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#0066cc",
    marginBottom: "8px",
    textTransform: "uppercase" as const,
  },
  insightText: {
    fontSize: "14px",
    lineHeight: 1.6,
    color: "var(--ink, #2d241d)",
    margin: "0 0 8px",
  },
  booksList: {
    margin: "0",
    paddingLeft: "20px",
  },
  bookItem: {
    fontSize: "13px",
    color: "var(--ink, #2d241d)",
    marginBottom: "4px",
  },
  optimizeButton: {
    padding: "8px 12px",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    marginTop: "12px",
    width: "100%",
  } as const,
  optimizeButtonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  } as const,
};

function getScoreColor(score: number): string {
  if (score >= 80) return "#28a745";
  if (score >= 70) return "#ffc107";
  return "#dc3545";
}

export function ValidationDashboard({
  scores,
  slug,
  onAutoOptimize,
  isOptimizing,
}: ValidationDashboardProps) {
  const [isRefining, setIsRefining] = useState(false);
  const [refinementResult, setRefinementResult] = useState<any>(null);
  const [isSavingPersonas, setIsSavingPersonas] = useState(false);

  const handleRefineToExcellence = async () => {
    if (!slug) {
      console.error("Slug is required for refinement");
      return;
    }

    setIsRefining(true);
    try {
      const result = await refinePromiseWithIntelligentAgents(slug);
      setRefinementResult(result);

      // Reload the page to get updated scores
      window.location.reload();
    } catch (error) {
      console.error("Refinement failed:", error);
      setRefinementResult({
        success: false,
        stoppedReason: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsRefining(false);
    }
  };

  const handleSaveValidatedPersonas = async () => {
    if (!slug) {
      console.error("Slug is required for saving personas");
      return;
    }

    setIsSavingPersonas(true);
    try {
      const result = await saveValidatedPersonas(slug);
      console.log("Save result:", result);

      // Reload the page to get updated scores
      window.location.reload();
    } catch (error) {
      console.error("Save failed:", error);
      setRefinementResult({
        success: false,
        stoppedReason: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSavingPersonas(false);
    }
  };

  return (
    <div style={styles.dashboard}>
      <div style={styles.header}>
        <h2 style={styles.title}>Promise Validation</h2>
        <div
          style={{
            ...styles.statusBadge,
            ...(scores.isReady ? styles.statusReady : styles.statusWork),
          }}
        >
          {scores.isReady ? "✓ Ready to Commit" : "⚠ Needs Optimization"}
        </div>
        {!scores.isReady && (
          <>
            <button
              onClick={handleRefineToExcellence}
              disabled={isRefining}
              style={{
                padding: "8px 16px",
                backgroundColor: "#16384f",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: isRefining ? "not-allowed" : "pointer",
                opacity: isRefining ? 0.6 : 1,
                transition: "opacity 0.2s ease",
              }}
            >
              {isRefining ? "Refining..." : "✨ Refine to Excellence"}
            </button>
            <button
              onClick={handleSaveValidatedPersonas}
              disabled={isSavingPersonas}
              title="Save the manually validated 3 personas designed with 8-step framework"
              style={{
                padding: "8px 16px",
                backgroundColor: "#28a745",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: isSavingPersonas ? "not-allowed" : "pointer",
                opacity: isSavingPersonas ? 0.6 : 1,
                transition: "opacity 0.2s ease",
              }}
            >
              {isSavingPersonas ? "Saving..." : "💾 Save Validated Personas"}
            </button>
          </>
        )}
      </div>

      {refinementResult && !refinementResult.success && (
        <div
          style={{
            padding: "12px 16px",
            backgroundColor: "#fff3cd",
            borderRadius: "6px",
            color: "#856404",
            fontSize: "14px",
            marginBottom: "16px",
          }}
        >
          {refinementResult.errorMessage || "Refinement completed with max iterations"}
        </div>
      )}

      <div style={styles.scoresGrid}>
        {/* Persona Match Score */}
        <div style={styles.scoreCard}>
          <h3 style={styles.scoreTitle}>Persona Match</h3>
          <div style={styles.scoreDisplay}>
            <span style={{ ...styles.scoreNumber, color: getScoreColor(scores.personaMatch.score) }}>
              {scores.personaMatch.score}
            </span>
            <span style={styles.scoreLabel}>/100</span>
          </div>
          <div style={styles.scoreBar}>
            <div
              style={{
                ...styles.scoreFill,
                width: `${scores.personaMatch.score}%`,
                backgroundColor: getScoreColor(scores.personaMatch.score),
              }}
            />
          </div>
          <div style={styles.breakdown}>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>End Users</span>
              <span>{scores.personaMatch.breakdown.endUserValidation}</span>
            </div>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>Pain Points</span>
              <span>{scores.personaMatch.breakdown.painPointSpecificity}</span>
            </div>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>Alignment</span>
              <span>{scores.personaMatch.breakdown.promiseAlignment}</span>
            </div>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>Buying Power</span>
              <span>{scores.personaMatch.breakdown.buyingPower}</span>
            </div>
          </div>
          <div style={styles.feedback}>
            {scores.personaMatch.feedback.map((f, i) => (
              <div key={i} style={styles.feedbackItem}>
                {f}
              </div>
            ))}
          </div>
          {scores.personaMatch.score < 80 && onAutoOptimize && (
            <button
              onClick={() => onAutoOptimize("personas")}
              disabled={isOptimizing}
              style={{
                ...styles.optimizeButton,
                ...(isOptimizing && styles.optimizeButtonDisabled),
              }}
            >
              {isOptimizing ? "Generating..." : "✨ Auto-Generate Personas"}
            </button>
          )}
        </div>

        {/* Market Viability Score */}
        <div style={styles.scoreCard}>
          <h3 style={styles.scoreTitle}>Market Viability</h3>
          <div style={styles.scoreDisplay}>
            <span style={{ ...styles.scoreNumber, color: getScoreColor(scores.marketViability.score) }}>
              {scores.marketViability.score}
            </span>
            <span style={styles.scoreLabel}>/100</span>
          </div>
          <div style={styles.scoreBar}>
            <div
              style={{
                ...styles.scoreFill,
                width: `${scores.marketViability.score}%`,
                backgroundColor: getScoreColor(scores.marketViability.score),
              }}
            />
          </div>
          <div style={styles.breakdown}>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>Market Size</span>
              <span>{scores.marketViability.breakdown.marketSize}</span>
            </div>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>Comparable Titles</span>
              <span>{scores.marketViability.breakdown.comparableTitles}</span>
            </div>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>Differentiation</span>
              <span>{scores.marketViability.breakdown.differentiation}</span>
            </div>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>Reachability</span>
              <span>{scores.marketViability.breakdown.reachability}</span>
            </div>
          </div>
          <div style={styles.feedback}>
            {scores.marketViability.feedback.map((f, i) => (
              <div key={i} style={styles.feedbackItem}>
                {f}
              </div>
            ))}
          </div>
          {scores.marketViability.score < 80 && onAutoOptimize && (
            <button
              onClick={() => onAutoOptimize("market")}
              disabled={isOptimizing}
              style={{
                ...styles.optimizeButton,
                ...(isOptimizing && styles.optimizeButtonDisabled),
              }}
            >
              {isOptimizing ? "Analyzing..." : "✨ Auto-Optimize Market"}
            </button>
          )}
        </div>

        {/* Promise Quality Score */}
        <div style={styles.scoreCard}>
          <h3 style={styles.scoreTitle}>Promise Quality</h3>
          <div style={styles.scoreDisplay}>
            <span style={{ ...styles.scoreNumber, color: getScoreColor(scores.promiseQuality.score) }}>
              {scores.promiseQuality.score}
            </span>
            <span style={styles.scoreLabel}>/100</span>
          </div>
          <div style={styles.scoreBar}>
            <div
              style={{
                ...styles.scoreFill,
                width: `${scores.promiseQuality.score}%`,
                backgroundColor: getScoreColor(scores.promiseQuality.score),
              }}
            />
          </div>
          <div style={styles.breakdown}>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>Specificity</span>
              <span>{scores.promiseQuality.breakdown.specificity}</span>
            </div>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>Differentiation</span>
              <span>{scores.promiseQuality.breakdown.differentiation}</span>
            </div>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>Credibility</span>
              <span>{scores.promiseQuality.breakdown.credibility}</span>
            </div>
            <div style={styles.breakdownItem}>
              <span style={styles.breakdownLabel}>Problem Priority</span>
              <span>{scores.promiseQuality.breakdown.problemPriority}</span>
            </div>
          </div>
          <div style={styles.feedback}>
            {scores.promiseQuality.feedback.map((f, i) => (
              <div key={i} style={styles.feedbackItem}>
                {f}
              </div>
            ))}
          </div>
          {scores.promiseQuality.score < 80 && onAutoOptimize && (
            <button
              onClick={() => onAutoOptimize("promise")}
              disabled={isOptimizing}
              style={{
                ...styles.optimizeButton,
                ...(isOptimizing && styles.optimizeButtonDisabled),
              }}
            >
              {isOptimizing ? "Improving..." : "✨ Auto-Improve Promise"}
            </button>
          )}
        </div>
      </div>

      {/* Triangulation */}
      <div style={styles.triangulation}>
        <h3 style={styles.triangulationTitle}>
          {scores.triangulation.isAligned ? "✓ Triangulation Aligned" : "⚠ Triangulation Issues"}
        </h3>
        {scores.triangulation.gaps.length > 0 && (
          <div style={styles.gaps}>
            <div style={styles.gapTitle}>Gaps to Address:</div>
            <ul style={styles.gapList}>
              {scores.triangulation.gaps.map((gap, i) => (
                <li key={i} style={styles.gapItem}>
                  {gap}
                </li>
              ))}
            </ul>
          </div>
        )}
        {scores.triangulation.suggestions.length > 0 && (
          <div style={styles.suggestions}>
            <div style={styles.suggestionTitle}>Improvement Suggestions:</div>
            <ul style={styles.suggestionList}>
              {scores.triangulation.suggestions.map((sug, i) => (
                <li key={i} style={styles.suggestionItem}>
                  {sug}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Gemini Market Research Insights */}
      {scores.marketViability.marketResearch && (
        <div style={styles.insightsSection}>
          <h3 style={styles.insightsTitle}>📊 Market Research Insights (Powered by Gemini)</h3>

          <div style={styles.insightCategory}>
            <div style={styles.insightCategoryTitle}>Market Size & Demand</div>
            <p style={styles.insightText}>{scores.marketViability.marketResearch.marketSize}</p>
            <p style={styles.insightText}>{scores.marketViability.marketResearch.trends}</p>
          </div>

          {scores.marketViability.marketResearch.comparableBooks &&
            scores.marketViability.marketResearch.comparableBooks.length > 0 && (
              <div style={styles.insightCategory}>
                <div style={styles.insightCategoryTitle}>Comparable Successful Books</div>
                <ul style={styles.booksList}>
                  {scores.marketViability.marketResearch.comparableBooks.map((book, i) => (
                    <li key={i} style={styles.bookItem}>
                      {book}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
