"use client";

import { useEffect, useState } from "react";
import type { TransformationArtifact } from "@/lib/promise-types";
import { ApprovalButtons, type ApprovalStatus } from "./approval-buttons";
import { generateTransformationArcAction } from "./actions";

function hasStructuredTransformationArc(
  value: TransformationArtifact["arc"] | undefined,
): value is TransformationArtifact["arc"] {
  return Boolean(
    value &&
      typeof value === "object" &&
      "stage1Me" in value &&
      value.stage1Me &&
      typeof value.stage1Me === "object",
  );
}

interface TransformationPhaseContainerProps {
  slug: string;
  data?: TransformationArtifact;
  isGenerating?: boolean;
  approvalStatus?: ApprovalStatus;
  approvalFeedback?: string;
  onApprove: (sectionId: string) => void;
  onReject: (sectionId: string, feedback: string) => void;
  onRegenerate: (sectionId: string) => void;
  onDataChange?: (data: TransformationArtifact) => void;
}

export default function TransformationPhaseContainer({
  slug,
  data,
  isGenerating = false,
  approvalStatus = "pending",
  approvalFeedback,
  onApprove,
  onReject,
  onRegenerate,
  onDataChange,
}: TransformationPhaseContainerProps) {
  const [transformationData, setTransformationData] = useState<TransformationArtifact | undefined>(data);
  const [localIsGenerating, setLocalIsGenerating] = useState(isGenerating);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoTriggered, setHasAutoTriggered] = useState(false);

  useEffect(() => {
    setTransformationData(data);
  }, [data]);

  useEffect(() => {
    setLocalIsGenerating(isGenerating);
  }, [isGenerating]);

  const handleGenerate = async () => {
    setLocalIsGenerating(true);
    setError(null);
    try {
      const generated = await generateTransformationArcAction(slug);
      setTransformationData(generated);
      onDataChange?.(generated);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate transformation framework",
      );
    } finally {
      setLocalIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!transformationData && !localIsGenerating && !hasAutoTriggered) {
      setHasAutoTriggered(true);
      void handleGenerate();
    }
  }, [transformationData, localIsGenerating, hasAutoTriggered]);

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
    highlightBox: {
      padding: "18px",
      backgroundColor: "rgba(22, 56, 79, 0.06)",
      border: "1px solid rgba(22, 56, 79, 0.16)",
      borderRadius: "12px",
      display: "grid" as const,
      gap: "10px",
    },
    highlightText: {
      fontSize: "16px",
      fontWeight: 700,
      color: "#16384f",
      lineHeight: 1.6,
      margin: 0,
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

  const arc = transformationData?.arc;
  const structuredArc = hasStructuredTransformationArc(arc) ? arc : undefined;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Transformation Journey Framework</h2>
        <p style={styles.description}>
          This phase maps the full reader journey using the ME-WE-TRUTH-YOU-WE structure so the book can move from your personal dilemma to practical application and shared vision.
        </p>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {structuredArc ? (
        <>
          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Stage 1: ME</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Personal Dilemma</p>
                <p style={styles.text}>{structuredArc.stage1Me.personalDilemma}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>False Belief</p>
                <p style={styles.text}>{structuredArc.stage1Me.falseBelief}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Manifestation</p>
                <p style={styles.text}>{structuredArc.stage1Me.manifestation}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Cost</p>
                <p style={styles.text}>{structuredArc.stage1Me.cost}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Authority To Teach</p>
                <p style={styles.text}>{structuredArc.stage1Me.authorityToTeach}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Vulnerability</p>
                <p style={styles.text}>{structuredArc.stage1Me.vulnerability}</p>
              </div>
            </div>
            <div style={styles.highlightBox}>
              <p style={styles.label}>Voice Blend</p>
              <p style={styles.highlightText}>{structuredArc.stage1Me.voiceBlend}</p>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Stage 2: WE</h3>
            <div style={styles.highlightBox}>
              <p style={styles.label}>Shared Problem</p>
              <p style={styles.highlightText}>{structuredArc.stage2We.sharedProblem}</p>
            </div>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Universal Tension</p>
                <p style={styles.text}>{structuredArc.stage2We.universalTension}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Reader Question</p>
                <p style={styles.text}>{structuredArc.stage2We.readerQuestion}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Stories That Make It Felt</p>
                <p style={styles.text}>{structuredArc.stage2We.emotionalBridgeStories}</p>
              </div>
            </div>
            <div style={styles.personaGrid}>
              {structuredArc.stage2We.personaDilemmas.map((persona) => (
                <div key={persona.personaName} style={styles.personaCard}>
                  <h4 style={styles.personaName}>{persona.personaName}</h4>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Recognized Dilemma</p>
                    <p style={styles.text}>{persona.recognizedDilemma}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>What Makes It Specific</p>
                    <p style={styles.text}>{persona.whatMakesItSpecific}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Stage 3: TRUTH</h3>
            <div style={styles.highlightBox}>
              <p style={styles.label}>Core Truth</p>
              <p style={styles.highlightText}>{structuredArc.stage3Truth.coreTruth}</p>
            </div>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Reframe</p>
                <p style={styles.text}>{structuredArc.stage3Truth.reframe}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Paradox</p>
                <p style={styles.text}>{structuredArc.stage3Truth.paradox}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Proof Mechanism</p>
                <p style={styles.text}>{structuredArc.stage3Truth.proofMechanism}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Truth Form</p>
                <p style={styles.text}>{structuredArc.stage3Truth.truthForm}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>If Embraced</p>
                <p style={styles.text}>{structuredArc.stage3Truth.ifEmbraced}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>If Ignored</p>
                <p style={styles.text}>{structuredArc.stage3Truth.ifIgnored}</p>
              </div>
            </div>
            <div style={styles.personaGrid}>
              {structuredArc.stage3Truth.personaAnswers.map((persona) => (
                <div key={persona.personaName} style={styles.personaCard}>
                  <h4 style={styles.personaName}>{persona.personaName}</h4>
                  <div style={styles.subsection}>
                    <p style={styles.label}>How Truth Answers Their Dilemma</p>
                    <p style={styles.text}>{persona.dilemmaAnswer}</p>
                  </div>
                  <div style={styles.voiceTag}>
                    {persona.voiceBlendResonates.voice}: {persona.voiceBlendResonates.why}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Stage 4: YOU</h3>
            <div style={styles.highlightBox}>
              <p style={styles.label}>First Action</p>
              <p style={styles.highlightText}>{structuredArc.stage4You.firstAction}</p>
            </div>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Instruction Style</p>
                <p style={styles.text}>{structuredArc.stage4You.instructionStyle}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Application Resistance</p>
                <p style={styles.text}>{structuredArc.stage4You.applicationResistance}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Success Vs Failure</p>
                <p style={styles.text}>{structuredArc.stage4You.successVsFailure}</p>
              </div>
            </div>
            <div style={styles.personaGrid}>
              {structuredArc.stage4You.personaApplications.map((persona) => (
                <div key={persona.personaName} style={styles.personaCard}>
                  <h4 style={styles.personaName}>{persona.personaName}</h4>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Next Step</p>
                    <p style={styles.text}>{persona.nextStep}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Obstacle Or Risk</p>
                    <p style={styles.text}>{persona.obstacleOrRisk}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Stage 5: Final WE</h3>
            <div style={styles.highlightBox}>
              <p style={styles.label}>Transformed Success</p>
              <p style={styles.highlightText}>{structuredArc.stage5FinalWe.transformedSuccess}</p>
            </div>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Collective Vision</p>
                <p style={styles.text}>{structuredArc.stage5FinalWe.collectiveVision}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Identity Shift</p>
                <p style={styles.text}>{structuredArc.stage5FinalWe.identityShift}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Why It Becomes Irreversible</p>
                <p style={styles.text}>{structuredArc.stage5FinalWe.irreversibility}</p>
              </div>
            </div>
            <div style={styles.personaGrid}>
              {structuredArc.stage5FinalWe.personaOutcomes.map((persona) => (
                <div key={persona.personaName} style={styles.personaCard}>
                  <h4 style={styles.personaName}>{persona.personaName}</h4>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Breakthrough</p>
                    <p style={styles.text}>{persona.breakthrough}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>What Becomes Possible</p>
                    <p style={styles.text}>{persona.whatBecomesPossible}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Stage 6: Implicit Patterns & Themes</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Shared Themes</p>
                <ul style={styles.list}>
                  {structuredArc.stage6Patterns.sharedThemes.map((theme, index) => {
                    return (
                      <li key={index} style={styles.listItem}>
                        {theme}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Implicit Lessons</p>
                <ul style={styles.list}>
                  {structuredArc.stage6Patterns.implicitLessons.map((lesson, index) => {
                    return (
                      <li key={index} style={styles.listItem}>
                        {lesson}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Story For ME</p>
                <p style={styles.text}>{structuredArc.stage6Patterns.storyByStage.me}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Story For WE</p>
                <p style={styles.text}>{structuredArc.stage6Patterns.storyByStage.we}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Story For TRUTH</p>
                <p style={styles.text}>{structuredArc.stage6Patterns.storyByStage.truth}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Story For YOU</p>
                <p style={styles.text}>{structuredArc.stage6Patterns.storyByStage.you}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Story For Final WE</p>
                <p style={styles.text}>{structuredArc.stage6Patterns.storyByStage.finalWe}</p>
              </div>
            </div>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Andy Moment</p>
                <p style={styles.text}>{structuredArc.stage6Patterns.voiceBlendMoments.andy}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Drucker Moment</p>
                <p style={styles.text}>{structuredArc.stage6Patterns.voiceBlendMoments.drucker}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Jobs Moment</p>
                <p style={styles.text}>{structuredArc.stage6Patterns.voiceBlendMoments.jobs}</p>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Stage 7: Book Map</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Opening Story</p>
                <p style={styles.text}>{structuredArc.stage7BookMap.openingStory}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Shared Dilemma Reveal</p>
                <p style={styles.text}>{structuredArc.stage7BookMap.sharedDilemmaReveal}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Truth Reveal</p>
                <p style={styles.text}>{structuredArc.stage7BookMap.truthReveal}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Application Start</p>
                <p style={styles.text}>{structuredArc.stage7BookMap.applicationStart}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Vision Casting</p>
                <p style={styles.text}>{structuredArc.stage7BookMap.visionCasting}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Implicit Persona Service</p>
                <p style={styles.text}>{structuredArc.stage7BookMap.implicitPersonaService}</p>
              </div>
            </div>
          </div>

          <div style={styles.highlightBox}>
            <p style={styles.label}>Complete Transformation</p>
            <p style={styles.highlightText}>{structuredArc.completeTransformation}</p>
          </div>
        </>
      ) : (
        <div style={styles.placeholderBox}>
          <p style={styles.placeholderText}>
            {localIsGenerating
              ? "Generating transformation framework..."
              : "No transformation framework generated yet"}
          </p>
        </div>
      )}

      {!arc ? (
        <div style={styles.buttonGroup}>
          <button
            onClick={handleGenerate}
            disabled={localIsGenerating}
            style={{
              ...styles.button,
              ...(localIsGenerating ? styles.buttonDisabled : {}),
            }}
          >
            {localIsGenerating ? "Generating..." : "Generate Transformation Framework"}
          </button>
        </div>
      ) : null}

      <div style={styles.approvalSection}>
        <ApprovalButtons
          sectionId="transformation"
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
