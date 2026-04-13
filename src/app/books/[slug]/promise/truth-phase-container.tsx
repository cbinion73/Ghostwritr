"use client";

import { useEffect, useState } from "react";
import type { CoreTruthsArtifact } from "@/lib/promise-types";
import { ApprovalButtons, type ApprovalStatus } from "./approval-buttons";
import { generateCoreTruthsAction } from "./actions";

interface TruthPhaseContainerProps {
  slug: string;
  data?: CoreTruthsArtifact;
  isGenerating?: boolean;
  approvalStatus?: ApprovalStatus;
  approvalFeedback?: string;
  onApprove: (sectionId: string) => void;
  onReject: (sectionId: string, feedback: string) => void;
  onRegenerate: (sectionId: string) => void;
  onDataChange?: (data: CoreTruthsArtifact) => void;
}

export default function TruthPhaseContainer({
  slug,
  data,
  isGenerating = false,
  approvalStatus = "pending",
  approvalFeedback,
  onApprove,
  onReject,
  onRegenerate,
  onDataChange,
}: TruthPhaseContainerProps) {
  const [truthData, setTruthData] = useState<CoreTruthsArtifact | undefined>(data);
  const [localIsGenerating, setLocalIsGenerating] = useState(isGenerating);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoTriggered, setHasAutoTriggered] = useState(false);

  useEffect(() => {
    setTruthData(data);
  }, [data]);

  useEffect(() => {
    setLocalIsGenerating(isGenerating);
  }, [isGenerating]);

  const handleGenerate = async () => {
    setLocalIsGenerating(true);
    setError(null);
    try {
      const generated = await generateCoreTruthsAction(slug);
      setTruthData(generated);
      onDataChange?.(generated);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate TRUTH section",
      );
    } finally {
      setLocalIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!truthData && !localIsGenerating && !hasAutoTriggered) {
      setHasAutoTriggered(true);
      void handleGenerate();
    }
  }, [truthData, localIsGenerating, hasAutoTriggered]);

  const styles = {
    container: {
      display: "grid" as const,
      gap: "24px",
      padding: "24px",
    },
    header: {
      display: "grid" as const,
      gap: "12px",
      marginBottom: "8px",
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
    truthHighlight: {
      padding: "18px",
      backgroundColor: "rgba(22, 56, 79, 0.06)",
      border: "1px solid rgba(22, 56, 79, 0.18)",
      borderRadius: "12px",
      display: "grid" as const,
      gap: "10px",
    },
    groundingBox: {
      padding: "18px",
      backgroundColor: "rgba(22, 163, 74, 0.05)",
      border: "1px solid rgba(22, 163, 74, 0.18)",
      borderRadius: "12px",
      display: "grid" as const,
      gap: "14px",
    },
    truthStatement: {
      fontSize: "18px",
      fontWeight: 700,
      color: "#16384f",
      lineHeight: 1.5,
      margin: 0,
    },
    groundingGrid: {
      display: "grid" as const,
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: "16px",
    },
    groundingList: {
      margin: 0,
      paddingLeft: "18px",
      display: "grid" as const,
      gap: "6px",
    },
    groundingListItem: {
      fontSize: "13px",
      color: "#2d241d",
      lineHeight: 1.6,
    },
    methodsRow: {
      display: "flex",
      flexWrap: "wrap" as const,
      gap: "8px",
    },
    methodPill: {
      padding: "6px 10px",
      borderRadius: "999px",
      backgroundColor: "rgba(22, 163, 74, 0.1)",
      border: "1px solid rgba(22, 163, 74, 0.2)",
      color: "#166534",
      fontSize: "12px",
      fontWeight: 600,
    },
    personaGrid: {
      display: "grid" as const,
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      gap: "16px",
    },
    personaCard: {
      padding: "18px",
      borderRadius: "12px",
      backgroundColor: "rgba(22, 56, 79, 0.04)",
      border: "1px solid rgba(22, 56, 79, 0.14)",
      display: "grid" as const,
      gap: "14px",
    },
    personaName: {
      fontSize: "15px",
      fontWeight: 700,
      color: "#16384f",
      margin: 0,
    },
    voiceTag: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "6px 10px",
      borderRadius: "999px",
      backgroundColor: "rgba(245, 158, 11, 0.12)",
      border: "1px solid rgba(245, 158, 11, 0.24)",
      color: "#92400e",
      fontSize: "12px",
      fontWeight: 600,
      width: "fit-content",
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
    buttonGroup: {
      display: "grid" as const,
      gap: "12px",
      gridAutoFlow: "column" as const,
      justifyContent: "flex-start",
    },
    button: {
      padding: "10px 16px",
      borderRadius: "8px",
      border: "1px solid #16384f",
      backgroundColor: "#16384f",
      color: "white",
      fontSize: "14px",
      fontWeight: 600,
      cursor: "pointer",
      transition: "opacity 0.2s",
    },
    buttonDisabled: {
      opacity: 0.5,
      cursor: "not-allowed",
    },
    approvalSection: {
      display: "grid" as const,
      gap: "16px",
      padding: "16px",
      backgroundColor: "rgba(255, 255, 255, 0.5)",
      borderRadius: "12px",
      border: "1px solid rgba(59, 44, 31, 0.12)",
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>TRUTH</h2>
        <p style={styles.description}>
          The governing reframe of the book: the false belief readers bring in, the
          paradox they need to accept, why it matters now, and how it lands for the
          three key personas.
        </p>
      </div>

      {error ? <div style={styles.errorBox}>{error}</div> : null}

      {truthData?.metadata?.grounding ? (
        <div style={styles.groundingBox}>
          <h3 style={styles.sectionTitle}>Grounded By</h3>
          <div style={styles.groundingGrid}>
            <div style={styles.subsection}>
              <p style={styles.label}>Previous Phases</p>
              <ul style={styles.groundingList}>
                {(truthData.metadata.grounding.previousPhases ?? []).map((phase) => (
                  <li key={phase} style={styles.groundingListItem}>
                    {phase}
                  </li>
                ))}
              </ul>
            </div>
            <div style={styles.subsection}>
              <p style={styles.label}>Audience Signals Used</p>
              <ul style={styles.groundingList}>
                {(truthData.metadata.grounding.audienceSignals ?? []).map((signal, index) => (
                  <li key={`${signal}-${index}`} style={styles.groundingListItem}>
                    {signal}
                  </li>
                ))}
              </ul>
            </div>
            <div style={styles.subsection}>
              <p style={styles.label}>Knowledge Base Sources</p>
              <ul style={styles.groundingList}>
                {(truthData.metadata.grounding.kbSources ?? []).length > 0 ? (
                  truthData.metadata.grounding.kbSources?.map((source, index) => (
                    <li key={`${source}-${index}`} style={styles.groundingListItem}>
                      {source}
                    </li>
                  ))
                ) : (
                  <li style={styles.groundingListItem}>No KB sources were attached to this generation.</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {truthData ? (
        <>
          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Core Insight</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>False Belief</p>
                <p style={styles.text}>{truthData.coreInsight.falseBelief}</p>
              </div>
              <div style={styles.truthHighlight}>
                <p style={styles.label}>Core Truth</p>
                <p style={styles.truthStatement}>{truthData.coreInsight.coreTruth}</p>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>The Paradox</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>What Makes It Surprising</p>
                <p style={styles.text}>{truthData.paradox.whatMakesThisSurprising}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Why It Feels Backwards</p>
                <p style={styles.text}>{truthData.paradox.whyItFeelsBackwards}</p>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Why This Truth Matters</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>If Embraced</p>
                <p style={styles.text}>{truthData.stakes.ifEmbraced}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>If Ignored</p>
                <p style={styles.text}>{truthData.stakes.ifIgnored}</p>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Evidence and Proof</h3>
            <div style={styles.subsection}>
              <p style={styles.label}>Methods of Proof</p>
              <div style={styles.methodsRow}>
                {truthData.evidence.methods.map((method) => (
                  <div key={method} style={styles.methodPill}>
                    {method}
                  </div>
                ))}
              </div>
            </div>
            <div style={styles.subsection}>
              <p style={styles.label}>Specific Evidence</p>
              <p style={styles.text}>{truthData.evidence.specificEvidence}</p>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>How The Personas Experience This Truth</h3>
            <div style={styles.personaGrid}>
              {truthData.personaExperiences.map((persona) => (
                <div key={persona.personaName} style={styles.personaCard}>
                  <div>
                    <h4 style={styles.personaName}>{persona.personaName}</h4>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Their Version of the Truth</p>
                    <p style={styles.text}>{persona.theirVersionOfTruth}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>What Makes It Land</p>
                    <p style={styles.text}>{persona.whatMakesItLand}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Voice Blend</p>
                    <div style={styles.voiceTag}>
                      {persona.voiceBlendResonates.voice}
                    </div>
                    <p style={styles.text}>{persona.voiceBlendResonates.why}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Why Now</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Why It Is Urgent</p>
                <p style={styles.text}>{truthData.whyNow.whyUrgentNow}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>What Has Escalated</p>
                <p style={styles.text}>{truthData.whyNow.escalatedProblem}</p>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>The Bridge From Old To New</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Permission Needed</p>
                <p style={styles.text}>{truthData.bridge.permissionNeeded}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Transition Reframe</p>
                <p style={styles.text}>{truthData.bridge.transitionReframe}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>What Stays The Same</p>
                <p style={styles.text}>{truthData.bridge.whatStaysSame}</p>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>The Complete TRUTH</h3>
            <div style={styles.truthHighlight}>
              <p style={styles.truthStatement}>{truthData.completeTruth}</p>
            </div>
          </div>
        </>
      ) : (
        <div style={styles.placeholderBox}>
          <p style={styles.placeholderText}>
            {localIsGenerating ? "Generating TRUTH..." : "No TRUTH section generated yet"}
          </p>
        </div>
      )}

      {!truthData ? (
        <div style={styles.buttonGroup}>
          <button
            onClick={() => {
              void handleGenerate();
            }}
            disabled={localIsGenerating}
            style={{
              ...styles.button,
              ...(localIsGenerating ? styles.buttonDisabled : {}),
            }}
          >
            {localIsGenerating ? "Generating..." : "Generate TRUTH"}
          </button>
        </div>
      ) : null}

      <div style={styles.approvalSection}>
        <ApprovalButtons
          sectionId="truth"
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
