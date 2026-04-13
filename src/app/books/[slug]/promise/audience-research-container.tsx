"use client";

import { useState, useCallback, useEffect } from "react";
import type {
  AudienceResearchArtifact,
  AudienceResearchPhase1,
  PersonaDeepProfile,
  PersonaComparisonAnalysis,
} from "@/lib/promise-types";
import AudienceResearchPhase1Section from "./audience-research-phase1";
import AudienceResearchPhase2 from "./audience-research-phase2";
import AudienceResearchPhase3 from "./audience-research-phase3";
import {
  generateAudienceResearchPhase1Action,
  generatePersonasDeepProfileAction,
  generatePersonaComparisonAnalysisAction,
} from "./actions";

interface AudienceResearchContainerProps {
  slug: string;
  initialData?: AudienceResearchArtifact;
  onApprove: (sectionId: string) => void;
  onReject: (sectionId: string, feedback: string) => void;
  onRegenerate: (sectionId: string) => void;
  approvalStatus?: "pending" | "approved" | "rejected";
  approvalFeedback?: string;
  onDataChange?: (data: AudienceResearchArtifact) => void;
}

export default function AudienceResearchContainer({
  slug,
  initialData,
  onApprove,
  onReject,
  onRegenerate,
  approvalStatus = "pending",
  approvalFeedback,
  onDataChange,
}: AudienceResearchContainerProps) {
  const [phase, setPhase] = useState<1 | 2 | 3>(initialData?.phase ?? 1);
  const [phase1Data, setPhase1Data] = useState<AudienceResearchPhase1 | null>(
    initialData?.phase1 ?? null
  );
  const [phase2Data, setPhase2Data] = useState<PersonaDeepProfile[] | null>(
    initialData?.phase2?.personas ?? null
  );
  const [phase3Data, setPhase3Data] = useState<PersonaComparisonAnalysis | null>(
    initialData?.phase3 ?? null
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPhase(initialData?.phase ?? 1);
    setPhase1Data(initialData?.phase1 ?? null);
    setPhase2Data(initialData?.phase2?.personas ?? null);
    setPhase3Data(initialData?.phase3 ?? null);
  }, [initialData]);

  // Phase 1: Generate research questions and user types
  const handleGeneratePhase1 = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const data = await generateAudienceResearchPhase1Action(slug);
      setPhase1Data(data);
      onDataChange?.({
        phase: 1,
        phase1: data,
        metadata: {
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate Phase 1");
    } finally {
      setIsGenerating(false);
    }
  }, [slug]);

  // Phase 2: Generate deep personas
  const handleGeneratePhase2 = useCallback(async (numPersonas: number = 5) => {
    if (!phase1Data) {
      setError("Complete Phase 1 first");
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const data = await generatePersonasDeepProfileAction(slug, phase1Data, numPersonas);
      setPhase2Data(data.personas);
      setPhase(2);
      onDataChange?.({
        phase: 2,
        phase1: phase1Data,
        phase2: {
          personas: data.personas,
        },
        metadata: {
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate Phase 2");
    } finally {
      setIsGenerating(false);
    }
  }, [slug, phase1Data]);

  // Phase 3: Generate comparison analysis
  const handleGeneratePhase3 = useCallback(async () => {
    if (!phase1Data || !phase2Data) {
      setError("Complete Phase 1 and 2 first");
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const data = await generatePersonaComparisonAnalysisAction(
        slug,
        phase2Data,
        phase1Data
      );
      setPhase3Data(data);
      setPhase(3);
      onDataChange?.({
        phase: 3,
        phase1: phase1Data,
        phase2: {
          personas: phase2Data,
        },
        phase3: data,
        metadata: {
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate Phase 3");
    } finally {
      setIsGenerating(false);
    }
  }, [slug, phase1Data, phase2Data]);

  const handleNextPhase = useCallback(async () => {
    if (phase === 1) {
      // Moving from Phase 1 to Phase 2 - trigger generation
      if (phase1Data && !phase2Data) {
        await handleGeneratePhase2();
      } else {
        setPhase(2);
      }
    } else if (phase === 2) {
      // Moving from Phase 2 to Phase 3 - trigger generation
      if (phase2Data && !phase3Data) {
        await handleGeneratePhase3();
      } else {
        setPhase(3);
      }
    }
  }, [phase, phase1Data, phase2Data, phase3Data, handleGeneratePhase2, handleGeneratePhase3]);

  const handlePreviousPhase = useCallback(() => {
    if (phase > 1) {
      setPhase((p) => (p - 1) as 1 | 2 | 3);
    }
  }, [phase]);

  const handleUpdatePhase1 = useCallback((data: AudienceResearchPhase1) => {
    setPhase1Data(data);
    onDataChange?.({
      phase,
      phase1: data,
      ...(phase2Data ? { phase2: { personas: phase2Data } } : {}),
      ...(phase3Data ? { phase3: phase3Data } : {}),
      metadata: {
        updatedAt: new Date().toISOString(),
      },
    });
  }, [onDataChange, phase, phase2Data, phase3Data]);

  const handleUpdatePhase2 = useCallback((personas: PersonaDeepProfile[]) => {
    setPhase2Data(personas);
    if (!phase1Data) return;
    onDataChange?.({
      phase: Math.max(phase, 2) as 1 | 2 | 3,
      phase1: phase1Data,
      phase2: { personas },
      ...(phase3Data ? { phase3: phase3Data } : {}),
      metadata: {
        updatedAt: new Date().toISOString(),
      },
    });
  }, [onDataChange, phase, phase1Data, phase3Data]);

  const handleUpdatePhase3 = useCallback((data: PersonaComparisonAnalysis) => {
    setPhase3Data(data);
    if (!phase1Data || !phase2Data) return;
    onDataChange?.({
      phase: 3,
      phase1: phase1Data,
      phase2: { personas: phase2Data },
      phase3: data,
      metadata: {
        updatedAt: new Date().toISOString(),
      },
    });
  }, [onDataChange, phase1Data, phase2Data]);

  const styles = {
    container: {
      display: "grid",
      gap: "24px",
      padding: "24px",
    } as const,
    header: {
      display: "grid",
      gap: "12px",
      marginBottom: "16px",
    } as const,
    title: {
      fontSize: "20px",
      fontWeight: 700,
      color: "#2d241d",
      margin: 0,
    } as const,
    progressBar: {
      display: "grid",
      gap: "8px",
    } as const,
    progressLabel: {
      fontSize: "12px",
      fontWeight: 600,
      textTransform: "uppercase" as const,
      color: "#6f6256",
    } as const,
    progressTrack: {
      width: "100%",
      height: "8px",
      borderRadius: "4px",
      backgroundColor: "rgba(59, 44, 31, 0.12)",
      overflow: "hidden" as const,
    } as const,
    progressFill: {
      height: "100%",
      backgroundColor: "#16a34a",
      transition: "width 0.3s ease",
      width: `${(phase / 3) * 100}%`,
    } as const,
    phaseIndicator: {
      fontSize: "12px",
      color: "#6f6256",
    } as const,
    errorBox: {
      padding: "12px 14px",
      backgroundColor: "#fee2e2",
      border: "1px solid #fecaca",
      borderRadius: "8px",
      color: "#991b1b",
      fontSize: "14px",
    } as const,
    content: {
      display: "grid",
      gap: "24px",
    } as const,
    controls: {
      display: "grid",
      gap: "12px",
      gridAutoFlow: "column" as const,
      justifyContent: "space-between",
      alignItems: "center",
    } as const,
    buttonGroup: {
      display: "grid",
      gap: "12px",
      gridAutoFlow: "column" as const,
    } as const,
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
    } as const,
    buttonSecondary: {
      padding: "10px 16px",
      borderRadius: "8px",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      backgroundColor: "transparent",
      color: "#16384f",
      fontSize: "14px",
      fontWeight: 600,
      cursor: "pointer",
      transition: "opacity 0.2s",
    } as const,
    buttonDisabled: {
      opacity: 0.5,
      cursor: "not-allowed",
    } as const,
    approvalSection: {
      display: "grid",
      gap: "16px",
      padding: "16px",
      backgroundColor: "rgba(255, 255, 255, 0.5)",
      borderRadius: "12px",
      border: "1px solid rgba(59, 44, 31, 0.12)",
    } as const,
    approvalLabel: {
      fontSize: "12px",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      color: "#6f6256",
    } as const,
    approvalStatus: {
      padding: "8px 12px",
      borderRadius: "6px",
      fontSize: "13px",
      fontWeight: 600,
      display: "inline-block",
      backgroundColor:
        approvalStatus === "approved"
          ? "#dcfce7"
          : approvalStatus === "rejected"
            ? "#fee2e2"
            : "#fef3c7",
      color:
        approvalStatus === "approved"
          ? "#166534"
          : approvalStatus === "rejected"
            ? "#991b1b"
            : "#78350f",
    } as const,
    feedbackBox: {
      padding: "12px",
      backgroundColor: "#fef3c7",
      borderLeft: "4px solid #f59e0b",
      borderRadius: "4px",
      fontSize: "13px",
      color: "#78350f",
    } as const,
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Audience & Personas Research</h2>
        <div style={styles.progressBar}>
          <div style={styles.progressLabel}>
            Phase {phase} of 3: {phase === 1 ? "Audience Discovery" : phase === 2 ? "Deep Persona Research" : "Comparative Analysis"}
          </div>
          <div style={styles.progressTrack}>
            <div style={styles.progressFill} />
          </div>
          <div style={styles.phaseIndicator}>
            {phase === 1 && "Research questions and user types"}
            {phase === 2 && "Detailed persona profiles with 8 sections each"}
            {phase === 3 && "Persona comparison and analysis"}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Content */}
      <div style={styles.content}>
        {phase === 1 && (
          <AudienceResearchPhase1Section
            slug={slug}
            data={phase1Data}
            isGenerating={isGenerating}
            onGenerate={handleGeneratePhase1}
            onUpdate={handleUpdatePhase1}
            onNext={handleNextPhase}
          />
        )}

        {phase === 2 && (
          <AudienceResearchPhase2
            slug={slug}
            data={phase2Data}
            phase1Data={phase1Data}
            isGenerating={isGenerating}
            onGenerate={handleGeneratePhase2}
            onUpdate={handleUpdatePhase2}
            onNext={handleNextPhase}
            onPrevious={handlePreviousPhase}
          />
        )}

        {phase === 3 && (
          <AudienceResearchPhase3
            slug={slug}
            data={phase3Data}
            personas={phase2Data}
            isGenerating={isGenerating}
            onGenerate={handleGeneratePhase3}
            onUpdate={handleUpdatePhase3}
            onPrevious={handlePreviousPhase}
          />
        )}
      </div>

      {/* Approval & Navigation */}
      {phase === 3 && phase3Data && (
        <div style={styles.approvalSection}>
          <div>
            <div style={styles.approvalLabel}>Approval Status</div>
            <div style={styles.approvalStatus}>
              {approvalStatus === "approved" && "✅ Approved"}
              {approvalStatus === "rejected" && "⚠️ Rejected"}
              {approvalStatus === "pending" && "⏳ Pending Review"}
            </div>
          </div>

          {approvalFeedback && (
            <div style={styles.feedbackBox}>
              <strong>Feedback:</strong> {approvalFeedback}
            </div>
          )}

          <div style={styles.controls}>
            <div style={styles.buttonGroup}>
              <button
                style={{
                  ...styles.buttonSecondary,
                  ...(isGenerating ? styles.buttonDisabled : {}),
                }}
                onClick={handlePreviousPhase}
                disabled={isGenerating}
              >
                ← Previous Phase
              </button>
            </div>

            <div style={styles.buttonGroup}>
              {approvalStatus !== "approved" && (
                <>
                  <button
                    style={{
                      ...styles.button,
                      ...(isGenerating ? styles.buttonDisabled : {}),
                    }}
                    onClick={() => {
                      onApprove("audience");
                    }}
                    disabled={isGenerating}
                  >
                    ✓ Approve
                  </button>
                  <button
                    style={{
                      ...styles.buttonSecondary,
                      ...(isGenerating ? styles.buttonDisabled : {}),
                    }}
                    onClick={() => {
                      const feedback = prompt(
                        "What needs improvement? (optional)"
                      );
                      if (feedback !== null) {
                        onReject("audience", feedback || "Please refine");
                      }
                    }}
                    disabled={isGenerating}
                  >
                    Request Changes
                  </button>
                </>
              )}

              {(approvalStatus === "rejected" || approvalStatus === "pending") && (
                <button
                  style={{
                    ...styles.button,
                    ...(isGenerating ? styles.buttonDisabled : {}),
                  }}
                  onClick={() => onRegenerate("audience")}
                  disabled={isGenerating}
                >
                  {isGenerating ? "Regenerating..." : "Regenerate"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
