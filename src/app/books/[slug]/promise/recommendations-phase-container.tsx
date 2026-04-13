"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  PositioningRecommendations,
  TitleSubtitleFinalization,
} from "@/lib/promise-types";
import { ApprovalButtons, type ApprovalStatus } from "./approval-buttons";
import {
  generatePositioningRecommendationsAction,
  generateTitleSubtitleFinalizationAction,
  saveTitleSubtitleFinalizationAction,
} from "./actions";

interface RecommendationsPhaseContainerProps {
  slug: string;
  data?: PositioningRecommendations;
  titleSubtitleFinalization?: TitleSubtitleFinalization;
  isGenerating?: boolean;
  approvalStatus?: ApprovalStatus;
  approvalFeedback?: string;
  onApprove: (sectionId: string) => void;
  onReject: (sectionId: string, feedback: string) => void;
  onRegenerate: (sectionId: string) => void | Promise<void>;
  onDataChange?: (data: PositioningRecommendations) => void;
  onTitleSubtitleFinalizationChange?: (data: TitleSubtitleFinalization) => void;
  onInvalidateApproval?: (sectionId: string) => void;
}

function formatDecisionLabel(value: "GO" | "NO_GO" | "CONDITIONAL_GO"): string {
  return value.replace(/_/g, " ");
}

export default function RecommendationsPhaseContainer({
  slug,
  data,
  titleSubtitleFinalization,
  isGenerating = false,
  approvalStatus = "pending",
  approvalFeedback,
  onApprove,
  onReject,
  onRegenerate,
  onDataChange,
  onTitleSubtitleFinalizationChange,
  onInvalidateApproval,
}: RecommendationsPhaseContainerProps) {
  const router = useRouter();
  const [recommendationsData, setRecommendationsData] = useState<PositioningRecommendations | undefined>(data);
  const [localIsGenerating, setLocalIsGenerating] = useState(isGenerating);
  const [error, setError] = useState<string | null>(null);
  const [hasAutoTriggered, setHasAutoTriggered] = useState(false);
  const [isTitleModalOpen, setIsTitleModalOpen] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [titleData, setTitleData] = useState<TitleSubtitleFinalization | undefined>(
    titleSubtitleFinalization,
  );
  const [titleDraft, setTitleDraft] = useState(
    titleSubtitleFinalization?.finalizedTitle ?? "",
  );
  const [subtitleDraft, setSubtitleDraft] = useState(
    titleSubtitleFinalization?.finalizedSubtitle ?? "",
  );
  const [positioningHookDraft, setPositioningHookDraft] = useState(
    titleSubtitleFinalization?.positioningHook ?? "",
  );
  const [titleRationaleDraft, setTitleRationaleDraft] = useState(
    titleSubtitleFinalization?.titleRationale ?? "",
  );
  const [subtitleRationaleDraft, setSubtitleRationaleDraft] = useState(
    titleSubtitleFinalization?.subtitleRationale ?? "",
  );
  const [audienceFitDraft, setAudienceFitDraft] = useState(
    titleSubtitleFinalization?.audienceFit ?? "",
  );
  const [marketFitDraft, setMarketFitDraft] = useState(
    titleSubtitleFinalization?.marketFit ?? "",
  );
  const needsRegeneration =
    !recommendationsData ||
    !recommendationsData.metadata?.model?.toLowerCase().includes("claude");

  useEffect(() => {
    setRecommendationsData(data);
  }, [data]);

  useEffect(() => {
    setLocalIsGenerating(isGenerating);
  }, [isGenerating]);

  useEffect(() => {
    setTitleData(titleSubtitleFinalization);
    setTitleDraft(titleSubtitleFinalization?.finalizedTitle ?? "");
    setSubtitleDraft(titleSubtitleFinalization?.finalizedSubtitle ?? "");
    setPositioningHookDraft(titleSubtitleFinalization?.positioningHook ?? "");
    setTitleRationaleDraft(titleSubtitleFinalization?.titleRationale ?? "");
    setSubtitleRationaleDraft(titleSubtitleFinalization?.subtitleRationale ?? "");
    setAudienceFitDraft(titleSubtitleFinalization?.audienceFit ?? "");
    setMarketFitDraft(titleSubtitleFinalization?.marketFit ?? "");
  }, [titleSubtitleFinalization]);

  const handleGenerate = async () => {
    setLocalIsGenerating(true);
    setError(null);
    try {
      const generated = await generatePositioningRecommendationsAction(slug);
      setRecommendationsData(generated);
      onDataChange?.(generated);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate recommendations",
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

  const handleRegenerate = async (_sectionId: string) => {
    setLocalIsGenerating(true);
    setError(null);
    try {
      await onRegenerate("recommendations");
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to regenerate recommendations",
      );
    } finally {
      setLocalIsGenerating(false);
    }
  };

  const applyTitlePackage = (next: TitleSubtitleFinalization) => {
    setTitleData(next);
    setTitleDraft(next.finalizedTitle);
    setSubtitleDraft(next.finalizedSubtitle);
    setPositioningHookDraft(next.positioningHook);
    setTitleRationaleDraft(next.titleRationale);
    setSubtitleRationaleDraft(next.subtitleRationale);
    setAudienceFitDraft(next.audienceFit);
    setMarketFitDraft(next.marketFit);
  };

  const handleGenerateTitlePackage = async () => {
    setIsGeneratingTitle(true);
    setTitleError(null);
    try {
      const generated = await generateTitleSubtitleFinalizationAction(slug);
      applyTitlePackage(generated);
    } catch (generationError) {
      setTitleError(
        generationError instanceof Error
          ? generationError.message
          : "Failed to generate title and subtitle package",
      );
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  const handleSaveTitlePackage = async () => {
    setIsSavingTitle(true);
    setTitleError(null);
    try {
      const saved = await saveTitleSubtitleFinalizationAction(slug, {
        finalizedTitle: titleDraft,
        finalizedSubtitle: subtitleDraft,
        positioningHook: positioningHookDraft,
        titleRationale: titleRationaleDraft,
        subtitleRationale: subtitleRationaleDraft,
        audienceFit: audienceFitDraft,
        marketFit: marketFitDraft,
        alternatives: titleData?.alternatives ?? [],
        metadata: titleData?.metadata,
      });
      applyTitlePackage(saved);
      onTitleSubtitleFinalizationChange?.(saved);
      onInvalidateApproval?.("book-promise");
      setIsTitleModalOpen(false);
      router.refresh();
    } catch (saveError) {
      setTitleError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save title and subtitle package",
      );
    } finally {
      setIsSavingTitle(false);
    }
  };

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
      width: "fit-content",
    },
    subtleMeta: {
      fontSize: "12px",
      color: "#6f6256",
      margin: 0,
    },
    cardGrid: {
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
      gap: "12px",
    },
    personaName: {
      fontSize: "15px",
      fontWeight: 700,
      color: "#16384f",
      margin: 0,
    },
    groundingBox: {
      padding: "18px",
      backgroundColor: "rgba(22, 163, 74, 0.05)",
      border: "1px solid rgba(22, 163, 74, 0.18)",
      borderRadius: "12px",
      display: "grid" as const,
      gap: "14px",
    },
    titleFinalizationBox: {
      padding: "20px",
      backgroundColor: "rgba(21, 94, 117, 0.05)",
      border: "1px solid rgba(21, 94, 117, 0.16)",
      borderRadius: "12px",
      display: "grid" as const,
      gap: "14px",
    },
    actionRow: {
      display: "flex" as const,
      gap: "12px",
      flexWrap: "wrap" as const,
      alignItems: "center" as const,
    },
    secondaryButton: {
      padding: "10px 14px",
      borderRadius: "999px",
      border: "1px solid rgba(21, 94, 117, 0.24)",
      backgroundColor: "#fffdf9",
      color: "#155e75",
      fontSize: "13px",
      fontWeight: 700,
      cursor: "pointer",
    },
    modalOverlay: {
      position: "fixed" as const,
      inset: 0,
      backgroundColor: "rgba(26, 20, 15, 0.5)",
      display: "flex" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      padding: "24px",
      zIndex: 50,
    },
    modalCard: {
      width: "min(960px, 100%)",
      maxHeight: "90vh",
      overflowY: "auto" as const,
      backgroundColor: "#fffdf9",
      borderRadius: "16px",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      boxShadow: "0 20px 60px rgba(26, 20, 15, 0.18)",
      padding: "24px",
      display: "grid" as const,
      gap: "20px",
    },
    modalHeader: {
      display: "flex" as const,
      justifyContent: "space-between" as const,
      gap: "16px",
      alignItems: "flex-start" as const,
    },
    closeButton: {
      border: "none",
      backgroundColor: "transparent",
      color: "#6f6256",
      cursor: "pointer",
      fontSize: "20px",
      lineHeight: 1,
      padding: 0,
    },
    input: {
      width: "100%",
      padding: "12px 14px",
      borderRadius: "10px",
      border: "1px solid rgba(59, 44, 31, 0.16)",
      backgroundColor: "#fffdf9",
      color: "#2d241d",
      fontSize: "14px",
      fontFamily: "inherit",
    },
    textarea: {
      width: "100%",
      minHeight: "112px",
      padding: "12px 14px",
      borderRadius: "10px",
      border: "1px solid rgba(59, 44, 31, 0.16)",
      backgroundColor: "#fffdf9",
      color: "#2d241d",
      fontSize: "14px",
      lineHeight: 1.6,
      fontFamily: "inherit",
      resize: "vertical" as const,
    },
    alternativesGrid: {
      display: "grid" as const,
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: "14px",
    },
    alternativeCard: {
      padding: "16px",
      borderRadius: "12px",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      backgroundColor: "rgba(255, 255, 255, 0.7)",
      display: "grid" as const,
      gap: "8px",
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
        <h2 style={styles.title}>Recommendations Blueprint</h2>
        <p style={styles.description}>
          This phase translates the full Promise workflow into concrete strategic direction: how to shape the book, position it, launch it, monetize it, resource it, and decide what must happen before Outline.
        </p>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {recommendationsData ? (
        <>
          <div style={styles.highlightBox}>
            <p style={styles.highlightText}>{recommendationsData.summary}</p>
            <span style={styles.badge}>
              {formatDecisionLabel(recommendationsData.finalRecommendation.overallRecommendation)}
            </span>
            <ul style={styles.list}>
              {recommendationsData.recommendations.map((item) => (
                <li key={item} style={styles.listItem}>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div style={styles.groundingBox}>
            <h3 style={styles.sectionTitle}>Grounded By</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Previous Phases</p>
                <ul style={styles.list}>
                  {(recommendationsData.metadata?.grounding?.previousPhases ?? []).map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Audience Signals Used</p>
                <ul style={styles.list}>
                  {(recommendationsData.metadata?.grounding?.audienceSignals ?? []).map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Knowledge Base Sources</p>
                <ul style={styles.list}>
                  {(recommendationsData.metadata?.grounding?.kbSources ?? []).map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Book Strategy</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Core Message Positioning</p>
                <p style={styles.text}>{recommendationsData.bookStrategy.coreMessagePositioning}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Audience Targeting</p>
                <p style={styles.text}>{recommendationsData.bookStrategy.audienceTargeting}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Content Depth & Breadth</p>
                <p style={styles.text}>{recommendationsData.bookStrategy.contentDepthAndBreadth}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Length & Structure</p>
                <p style={styles.text}>{recommendationsData.bookStrategy.lengthAndStructure}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Voice & Tone</p>
                <p style={styles.text}>{recommendationsData.bookStrategy.voiceAndToneRecommendations}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Differentiation Strategy</p>
                <p style={styles.text}>{recommendationsData.bookStrategy.differentiationStrategy}</p>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Positioning & Marketing</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Positioning Statement</p>
                <p style={styles.text}>{recommendationsData.positioningAndMarketing.marketPositioningStatement}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Target Customer Profile</p>
                <p style={styles.text}>{recommendationsData.positioningAndMarketing.targetCustomerProfile}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Competitive Quadrant</p>
                <p style={styles.text}>{recommendationsData.positioningAndMarketing.competitivePositioningQuadrant}</p>
              </div>
            </div>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Key Differentiators</p>
                <ul style={styles.list}>
                  {recommendationsData.positioningAndMarketing.keyDifferentiators.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Positioning By Channel</p>
                <ul style={styles.list}>
                  {recommendationsData.positioningAndMarketing.positioningByChannel.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Messaging Framework</p>
                <ul style={styles.list}>
                  {recommendationsData.positioningAndMarketing.messagingFramework.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Launch & Go-To-Market</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Publishing Path</p>
                <p style={styles.text}>{recommendationsData.launchAndGoToMarket.publishingPathRecommendation}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Launch Timeline</p>
                <p style={styles.text}>{recommendationsData.launchAndGoToMarket.launchTimeline}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Marketing Budget</p>
                <p style={styles.text}>{recommendationsData.launchAndGoToMarket.marketingBudgetAllocation}</p>
              </div>
            </div>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Pre-Launch</p>
                <ul style={styles.list}>
                  {recommendationsData.launchAndGoToMarket.preLaunchActivities.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Launch</p>
                <ul style={styles.list}>
                  {recommendationsData.launchAndGoToMarket.launchActivities.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Post-Launch</p>
                <ul style={styles.list}>
                  {recommendationsData.launchAndGoToMarket.postLaunchActivities.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Channel Priorities</p>
                <ul style={styles.list}>
                  {recommendationsData.launchAndGoToMarket.distributionChannelPriorities.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Persona Strategies</h3>
            <div style={styles.cardGrid}>
              {recommendationsData.personaStrategies.map((persona) => (
                <div key={persona.personaName} style={styles.personaCard}>
                  <p style={styles.personaName}>{persona.personaName}</p>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Primary Positioning</p>
                    <p style={styles.text}>{persona.primaryPositioning}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Key Message</p>
                    <p style={styles.text}>{persona.keyMessage}</p>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Where To Reach Them</p>
                    <ul style={styles.list}>
                      {persona.whereToReachThem.map((item) => (
                        <li key={item} style={styles.listItem}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Launch Strategy</p>
                    <p style={styles.text}>{persona.launchStrategy}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Cross-Persona Messaging</p>
                <ul style={styles.list}>
                  {recommendationsData.crossPersonaMessaging.sharedMessaging.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Persona-Specific Messaging</p>
                <ul style={styles.list}>
                  {recommendationsData.crossPersonaMessaging.personaSpecificMessaging.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Avoid Alienating</p>
                <p style={styles.text}>{recommendationsData.crossPersonaMessaging.avoidAlienating}</p>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>Monetization, Resources & Risk</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Book Pricing</p>
                <p style={styles.text}>{recommendationsData.monetizationRecommendations.bookPricingRecommendation}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Revenue Model</p>
                <p style={styles.text}>{recommendationsData.monetizationRecommendations.revenueModelRecommendation}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Writing Support</p>
                <p style={styles.text}>{recommendationsData.teamAndResources.writingSupport}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Team Composition</p>
                <p style={styles.text}>{recommendationsData.teamAndResources.teamCompositionRecommendation}</p>
              </div>
            </div>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Ancillary Products</p>
                <ul style={styles.list}>
                  {recommendationsData.monetizationRecommendations.ancillaryProductRecommendations.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Ecosystem Timeline</p>
                <ul style={styles.list}>
                  {recommendationsData.monetizationRecommendations.ecosystemBuildOutTimeline.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Resource Timeline</p>
                <ul style={styles.list}>
                  {recommendationsData.teamAndResources.timelineAndMilestones.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Risk Mitigation</p>
                <ul style={styles.list}>
                  {recommendationsData.riskMitigationRecommendations.map((item) => (
                    <li key={item.risk} style={styles.listItem}>
                      <strong>{item.risk}:</strong> {item.mitigationStrategy}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div style={styles.sectionCard}>
            <h3 style={styles.sectionTitle}>KPIs, Financials & Final Direction</h3>
            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Year 1 Targets</p>
                <ul style={styles.list}>
                  {recommendationsData.successMetricsAndKpis.yearOneSuccessTargets.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Monthly KPIs</p>
                <ul style={styles.list}>
                  {recommendationsData.successMetricsAndKpis.monthlyKpis.map((item) => (
                    <li key={item} style={styles.listItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Investment Required</p>
                <p style={styles.text}>{recommendationsData.financialRecommendations.investmentRequired}</p>
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Profitability Timeline</p>
                <p style={styles.text}>{recommendationsData.financialRecommendations.profitabilityTimeline}</p>
              </div>
            </div>
            <div style={styles.highlightBox}>
              <span style={styles.badge}>
                {formatDecisionLabel(recommendationsData.finalRecommendation.overallRecommendation)}
              </span>
              <p style={styles.text}>{recommendationsData.finalRecommendation.rationale}</p>
              <p style={styles.text}>{recommendationsData.finalRecommendation.strategicDirection}</p>
              <div style={styles.sectionGrid}>
                <div style={styles.subsection}>
                  <p style={styles.label}>Critical Success Factors</p>
                  <ul style={styles.list}>
                    {recommendationsData.finalRecommendation.criticalSuccessFactors.map((item) => (
                      <li key={item} style={styles.listItem}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div style={styles.subsection}>
                  <p style={styles.label}>Immediate Next Steps</p>
                  <ul style={styles.list}>
                    {recommendationsData.finalRecommendation.immediateNextSteps.map((item) => (
                      <li key={item} style={styles.listItem}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div style={styles.subsection}>
                  <p style={styles.label}>Go/No-Go Gates</p>
                  <ul style={styles.list}>
                    {recommendationsData.finalRecommendation.goNoGoGates.map((item) => (
                      <li key={item} style={styles.listItem}>{item}</li>
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
            Recommendations will auto-generate here once this phase opens.
          </p>
        </div>
      )}

      <div style={styles.titleFinalizationBox}>
        <h3 style={styles.sectionTitle}>Optional: Finalize Title & Subtitle</h3>
        <p style={styles.description}>
          Before Book Pitch, you can lock the title package using the market, persona, truth,
          transformation, and recommendations work. This gives the final pitch a validated title
          direction instead of relying on the original setup title.
        </p>
        {titleData ? (
          <div style={styles.sectionGrid}>
            <div style={styles.subsection}>
              <p style={styles.label}>Final Title</p>
              <p style={styles.highlightText}>{titleData.finalizedTitle}</p>
            </div>
            <div style={styles.subsection}>
              <p style={styles.label}>Final Subtitle</p>
              <p style={styles.text}>{titleData.finalizedSubtitle}</p>
            </div>
            <div style={styles.subsection}>
              <p style={styles.label}>Why This Package Works</p>
              <p style={styles.text}>{titleData.positioningHook}</p>
            </div>
          </div>
        ) : (
          <p style={styles.text}>
            No title package is saved yet. You can skip this and move on, or open the modal and
            generate a grounded title/subtitle package first.
          </p>
        )}
        <div style={styles.actionRow}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => {
              setTitleError(null);
              setIsTitleModalOpen(true);
            }}
          >
            {titleData ? "Edit Title Package" : "Open Title Finalization"}
          </button>
          {titleData?.metadata?.updatedAt ? (
            <p style={styles.subtleMeta}>
              Saved {new Date(titleData.metadata.updatedAt).toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>

      <div style={styles.approvalSection}>
        <ApprovalButtons
          sectionId="recommendations"
          status={approvalStatus}
          feedback={approvalFeedback}
          onApprove={onApprove}
          onReject={onReject}
          onRegenerate={handleRegenerate}
          isLoading={localIsGenerating}
        />
      </div>

      {isTitleModalOpen ? (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <div style={styles.header}>
                <h3 style={styles.title}>Title & Subtitle Finalization</h3>
                <p style={styles.description}>
                  Use the full Promise research stack to pressure-test the title package before the
                  Book Pitch is compiled.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTitleModalOpen(false)}
                style={styles.closeButton}
                aria-label="Close title finalization modal"
              >
                ×
              </button>
            </div>

            {titleError ? <div style={styles.errorBox}>{titleError}</div> : null}

            <div style={styles.actionRow}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => void handleGenerateTitlePackage()}
                disabled={isGeneratingTitle || isSavingTitle}
              >
                {isGeneratingTitle ? "Generating..." : "Generate From Research"}
              </button>
              <p style={styles.subtleMeta}>
                This uses persona, market, truth, transformation, recommendations, and KB signals.
              </p>
            </div>

            <div style={styles.sectionGrid}>
              <div style={styles.subsection}>
                <p style={styles.label}>Final Title</p>
                <input
                  value={titleDraft}
                  onChange={(event) => setTitleDraft(event.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Final Subtitle</p>
                <input
                  value={subtitleDraft}
                  onChange={(event) => setSubtitleDraft(event.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Positioning Hook</p>
                <textarea
                  value={positioningHookDraft}
                  onChange={(event) => setPositioningHookDraft(event.target.value)}
                  style={styles.textarea}
                />
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Audience Fit</p>
                <textarea
                  value={audienceFitDraft}
                  onChange={(event) => setAudienceFitDraft(event.target.value)}
                  style={styles.textarea}
                />
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Title Rationale</p>
                <textarea
                  value={titleRationaleDraft}
                  onChange={(event) => setTitleRationaleDraft(event.target.value)}
                  style={styles.textarea}
                />
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Subtitle Rationale</p>
                <textarea
                  value={subtitleRationaleDraft}
                  onChange={(event) => setSubtitleRationaleDraft(event.target.value)}
                  style={styles.textarea}
                />
              </div>
              <div style={styles.subsection}>
                <p style={styles.label}>Market Fit</p>
                <textarea
                  value={marketFitDraft}
                  onChange={(event) => setMarketFitDraft(event.target.value)}
                  style={styles.textarea}
                />
              </div>
            </div>

            {(titleData?.alternatives?.length ?? 0) > 0 ? (
              <div style={styles.sectionCard}>
                <h4 style={styles.sectionTitle}>Alternative Packages</h4>
                <div style={styles.alternativesGrid}>
                  {titleData?.alternatives.map((alternative) => (
                    <div key={`${alternative.title}-${alternative.subtitle}`} style={styles.alternativeCard}>
                      <p style={styles.label}>Title</p>
                      <p style={styles.personaName}>{alternative.title}</p>
                      <p style={styles.label}>Subtitle</p>
                      <p style={styles.text}>{alternative.subtitle}</p>
                      <p style={styles.label}>Why It Could Work</p>
                      <p style={styles.text}>{alternative.whyItCouldWork}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {titleData?.metadata?.grounding ? (
              <div style={styles.groundingBox}>
                <h4 style={styles.sectionTitle}>Grounded By</h4>
                <div style={styles.sectionGrid}>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Previous Phases</p>
                    <ul style={styles.list}>
                      {(titleData.metadata.grounding.previousPhases ?? []).map((item) => (
                        <li key={item} style={styles.listItem}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div style={styles.subsection}>
                    <p style={styles.label}>Knowledge Base Sources</p>
                    <ul style={styles.list}>
                      {(titleData.metadata.grounding.kbSources ?? []).map((item) => (
                        <li key={item} style={styles.listItem}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : null}

            <div style={styles.actionRow}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setIsTitleModalOpen(false)}
                disabled={isSavingTitle}
              >
                Close
              </button>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => void handleSaveTitlePackage()}
                disabled={isSavingTitle || !titleDraft.trim() || !subtitleDraft.trim()}
              >
                {isSavingTitle ? "Saving..." : "Save Title Package"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
