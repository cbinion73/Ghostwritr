"use client";

import { useEffect, useState } from "react";
import {
  savePromiseStatement,
  generatePromiseTemplate,
  validatePromise,
  refinePomiseWithAI,
  autoGeneratePersonasAction,
  generateAudienceResearchPhase1Action,
  generateMarketAnalysisAction,
  autoImprovePromiseAction,
  generateCoreTruthsAction,
  generateTransformationArcAction,
  generatePositioningRecommendationsAction,
  compileBookPromiseReportAction,
  commitPromiseStage,
  approvePromisePhaseAction,
  rejectPromisePhaseAction,
} from "./actions";
import { ValidationDashboard } from "./validation-dashboard";
import { type ApprovalStatus } from "./approval-buttons";
import { PersonaCardVisual } from "./persona-card-visual";
import { TransformationArcDiagram } from "./transformation-arc-diagram";
import { SectionStatusTracker, type SectionStatus } from "./section-status-tracker";
import { ExportMenu } from "./export-menu";
import AudienceResearchContainer from "./audience-research-container";
import TruthPhaseContainer from "./truth-phase-container";
import TransformationPhaseContainer from "./transformation-phase-container";
import MarketPhaseContainer from "./market-phase-container";
import RecommendationsPhaseContainer from "./recommendations-phase-container";
import BookPitchPhaseContainer from "./book-pitch-phase-container";
import PromiseStatementContainer from "./promise-statement-container";
import type {
  AudienceResearchArtifact,
  BookPromiseReport,
  CoreTruthsArtifact,
  MarketReport,
  PersonaPack,
  PromiseArtifactMetadata,
  PositioningRecommendations,
  PromiseArtifactAvailability,
  PromiseBrief,
  PromisePhaseApprovals,
  PromiseTabName,
  TitleSubtitleFinalization,
  TransformationArtifact,
} from "@/lib/promise-types";
import type { ValidationScores } from "@/lib/validation/promise-validator";

interface PromiseTabsProps {
  slug: string;
  promise: PromiseBrief;
  personas: PersonaPack;
  market: MarketReport;
  recommendations: PositioningRecommendations;
  audienceResearch?: AudienceResearchArtifact;
  coreTruths?: CoreTruthsArtifact;
  transformationArc?: TransformationArtifact;
  titleSubtitleFinalization?: TitleSubtitleFinalization;
  bookPromiseReport?: BookPromiseReport;
  phaseApprovals: PromisePhaseApprovals;
  artifactAvailability: PromiseArtifactAvailability;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
}

function formatTokenCount(value?: number | null): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

function getUsageLabel(metadata?: PromiseArtifactMetadata): string {
  const model = metadata?.model ?? "manual or unavailable";
  const usage = metadata?.tokenUsage;

  if (!usage) {
    return `Model: ${model} | Tokens: not captured`;
  }

  return `Model: ${model} | In ${formatTokenCount(usage.inputTokens)} | Out ${formatTokenCount(
    usage.outputTokens,
  )} | Total ${formatTokenCount(usage.totalTokens)}`;
}

export function PromiseTabs({
  slug,
  promise,
  personas,
  market,
  recommendations,
  audienceResearch,
  coreTruths,
  transformationArc,
  titleSubtitleFinalization,
  bookPromiseReport,
  phaseApprovals,
  artifactAvailability,
  messages = [],
}: PromiseTabsProps) {
  const tabOrder: PromiseTabName[] = [
    "promise-statement",
    "audience",
    "truth",
    "transformation",
    "market",
    "recommendations",
    "book-promise",
  ];

  const initialApprovalStatuses = tabOrder.reduce<Record<PromiseTabName, ApprovalStatus>>(
    (accumulator, tab) => {
      accumulator[tab] = phaseApprovals[tab]?.status ?? "pending";
      return accumulator;
    },
    {} as Record<PromiseTabName, ApprovalStatus>,
  );

  const initialApprovalFeedback = tabOrder.reduce<Record<PromiseTabName, string>>(
    (accumulator, tab) => {
      accumulator[tab] = phaseApprovals[tab]?.feedback ?? "";
      return accumulator;
    },
    {} as Record<PromiseTabName, string>,
  );

  const firstPendingTab =
    tabOrder.find((tab) => initialApprovalStatuses[tab] !== "approved") ?? "book-promise";

  const [activeTab, setActiveTab] = useState<PromiseTabName>(firstPendingTab);
  const [editingPromise, setEditingPromise] = useState(promise.promiseStatement);
  const [audienceData, setAudienceData] = useState(audienceResearch);
  const [truthData, setTruthData] = useState(coreTruths);
  const [transformationData, setTransformationData] = useState(transformationArc);
  const [marketData, setMarketData] = useState(market);
  const [recommendationsData, setRecommendationsData] = useState(recommendations);
  const [titleSubtitleData, setTitleSubtitleData] = useState(titleSubtitleFinalization);
  const [bookPromiseReportData, setBookPromiseReportData] = useState(bookPromiseReport);
  const [currentBookTitle, setCurrentBookTitle] = useState(
    titleSubtitleFinalization?.finalizedTitle || bookPromiseReport?.title || promise.workingTitle,
  );
  const [availableArtifacts, setAvailableArtifacts] = useState(artifactAvailability);
  const [validationScores, setValidationScores] = useState<ValidationScores | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Approval state management
  const [approvalStatuses, setApprovalStatuses] =
    useState<Record<PromiseTabName, ApprovalStatus>>(initialApprovalStatuses);

  const [approvalFeedback, setApprovalFeedback] =
    useState<Record<PromiseTabName, string>>(initialApprovalFeedback);

  // Track which tabs are currently generating
  const [isGenerating, setIsGenerating] = useState<Record<PromiseTabName, boolean>>({
    "promise-statement": false,
    audience: false,
    truth: false,
    transformation: false,
    market: false,
    recommendations: false,
    "book-promise": false,
  });

  const bookPitchStaleAfterTitleFinalization = Boolean(
    titleSubtitleData?.metadata?.updatedAt &&
      bookPromiseReportData?.metadata?.updatedAt &&
      Date.parse(titleSubtitleData.metadata.updatedAt) >
        Date.parse(bookPromiseReportData.metadata.updatedAt),
  );

  useEffect(() => {
    setTitleSubtitleData(titleSubtitleFinalization);
  }, [titleSubtitleFinalization]);

  useEffect(() => {
    if (titleSubtitleData?.finalizedTitle) {
      setCurrentBookTitle(titleSubtitleData.finalizedTitle);
      return;
    }

    if (bookPromiseReportData?.title) {
      setCurrentBookTitle(bookPromiseReportData.title);
      return;
    }

    setCurrentBookTitle(promise.workingTitle);
  }, [titleSubtitleData, bookPromiseReportData, promise.workingTitle]);

  const tabs: Array<{ id: PromiseTabName; label: string; stepNumber: number }> = [
    { id: "promise-statement", label: "Promise Statement", stepNumber: 1 },
    { id: "audience", label: "Audience", stepNumber: 2 },
    { id: "truth", label: "Truth", stepNumber: 3 },
    { id: "transformation", label: "Transformation", stepNumber: 4 },
    { id: "market", label: "Market", stepNumber: 5 },
    { id: "recommendations", label: "Recommendations", stepNumber: 6 },
    { id: "book-promise", label: "Book Pitch", stepNumber: 7 },
  ];

  // Linear gating: tab is unlocked if previous tab is approved
  const isTabUnlocked = (tabName: PromiseTabName): boolean => {
    const currentIndex = tabOrder.indexOf(tabName);
    if (currentIndex === 0) return true; // First tab always unlocked
    const previousTab = tabOrder[currentIndex - 1];
    return approvalStatuses[previousTab] === "approved";
  };

  const applyPersistedApprovals = (nextApprovals: PromisePhaseApprovals) => {
    setApprovalStatuses((prev) => {
      const updated = { ...prev };
      for (const tab of tabOrder) {
        updated[tab] = nextApprovals[tab]?.status ?? "pending";
      }
      return updated;
    });

    setApprovalFeedback((prev) => {
      const updated = { ...prev };
      for (const tab of tabOrder) {
        updated[tab] = nextApprovals[tab]?.feedback ?? "";
      }
      return updated;
    });
  };

  const launchAutomationForTab = async (tab: PromiseTabName) => {
    setIsGenerating((prev) => ({ ...prev, [tab]: true }));

    try {
      if (tab === "audience" && !availableArtifacts.audienceResearch) {
        const phase1 = await generateAudienceResearchPhase1Action(slug);
        setAudienceData({
          phase: 1,
          phase1,
          metadata: {
            updatedAt: new Date().toISOString(),
          },
        });
        setAvailableArtifacts((prev) => ({ ...prev, audienceResearch: true }));
        return;
      }

      if (tab === "truth" && !availableArtifacts.coreTruths) {
        const generatedTruth = await generateCoreTruthsAction(slug);
        setTruthData(generatedTruth);
        setAvailableArtifacts((prev) => ({ ...prev, coreTruths: true }));
        return;
      }

      if (tab === "transformation" && !availableArtifacts.transformationArc) {
        const generatedTransformation = await generateTransformationArcAction(slug);
        setTransformationData(generatedTransformation);
        setAvailableArtifacts((prev) => ({ ...prev, transformationArc: true }));
        return;
      }

      const marketNeedsRefresh =
        !availableArtifacts.market ||
        !marketData?.metadata?.model?.toLowerCase().includes("gemini");

      if (tab === "market" && marketNeedsRefresh) {
        const generatedMarket = await generateMarketAnalysisAction(slug);
        setMarketData(generatedMarket);
        setAvailableArtifacts((prev) => ({ ...prev, market: true }));
        return;
      }

      const recommendationsNeedRefresh =
        !availableArtifacts.recommendations ||
        !recommendationsData?.metadata?.model?.toLowerCase().includes("claude");

      if (tab === "recommendations" && recommendationsNeedRefresh) {
        const generatedRecommendations = await generatePositioningRecommendationsAction(slug);
        setRecommendationsData(generatedRecommendations);
        setAvailableArtifacts((prev) => ({ ...prev, recommendations: true }));
        return;
      }

      const bookPitchNeedsRefresh =
        !availableArtifacts.bookPromiseReport ||
        !bookPromiseReportData?.documentMarkdown ||
        bookPromiseReportData?.metadata?.model?.toLowerCase().startsWith("fallback") ||
        bookPitchStaleAfterTitleFinalization;

      if (tab === "book-promise" && bookPitchNeedsRefresh) {
        const report = await compileBookPromiseReportAction(slug);
        setBookPromiseReportData(report);
        setAvailableArtifacts((prev) => ({ ...prev, bookPromiseReport: true }));
      }
    } catch (error) {
      console.error(`Failed to auto-generate ${tab}:`, error);
    } finally {
      setIsGenerating((prev) => ({ ...prev, [tab]: false }));
    }
  };

  const handleApproveSection = async (sectionId: string) => {
    const phaseId = sectionId as PromiseTabName;
    setIsGenerating((prev) => ({ ...prev, [phaseId]: true }));

    try {
      if (phaseId === "promise-statement" && editingPromise.trim()) {
        await savePromiseStatement(slug, editingPromise);
        setAvailableArtifacts((prev) => ({ ...prev, promiseBrief: true }));
      }

      const nextApprovals = await approvePromisePhaseAction(slug, phaseId);
      applyPersistedApprovals(nextApprovals);

      const currentIndex = tabOrder.indexOf(phaseId);
      if (currentIndex < tabOrder.length - 1) {
        const nextTab = tabOrder[currentIndex + 1];
        setActiveTab(nextTab);
        await launchAutomationForTab(nextTab);
      }
    } catch (error) {
      console.error(`Failed to approve ${phaseId}:`, error);
    } finally {
      setIsGenerating((prev) => ({ ...prev, [phaseId]: false }));
    }
  };

  const handleRejectSection = async (sectionId: string, feedback: string) => {
    const phaseId = sectionId as PromiseTabName;
    setIsGenerating((prev) => ({ ...prev, [phaseId]: true }));

    try {
      const nextApprovals = await rejectPromisePhaseAction(slug, phaseId, feedback);
      applyPersistedApprovals(nextApprovals);
    } catch (error) {
      console.error(`Failed to request changes for ${phaseId}:`, error);
    } finally {
      setIsGenerating((prev) => ({ ...prev, [phaseId]: false }));
    }
  };

  const handleRegenerateSection = async (sectionId: string): Promise<void> => {
    const phaseId = sectionId as PromiseTabName;
    setIsGenerating((prev) => ({ ...prev, [phaseId]: true }));
    setIsOptimizing(true);

    try {
      // Regenerate based on section type
      if (sectionId === "promise-statement") {
        const improved = await autoImprovePromiseAction(slug);
        setEditingPromise(improved);
      } else if (sectionId === "audience") {
        const phase1 = await generateAudienceResearchPhase1Action(slug);
        setAudienceData({
          phase: 1,
          phase1,
          metadata: {
            updatedAt: new Date().toISOString(),
          },
        });
        setAvailableArtifacts((prev) => ({ ...prev, audienceResearch: true }));
      } else if (sectionId === "truth") {
        const regeneratedTruth = await generateCoreTruthsAction(slug);
        setTruthData(regeneratedTruth);
        setAvailableArtifacts((prev) => ({ ...prev, coreTruths: true }));
      } else if (sectionId === "transformation") {
        const regeneratedTransformation = await generateTransformationArcAction(slug);
        setTransformationData(regeneratedTransformation);
        setAvailableArtifacts((prev) => ({ ...prev, transformationArc: true }));
      } else if (sectionId === "market") {
        const regeneratedMarket = await generateMarketAnalysisAction(slug);
        setMarketData(regeneratedMarket);
        setAvailableArtifacts((prev) => ({ ...prev, market: true }));
      } else if (sectionId === "recommendations") {
        const regeneratedRecommendations = await generatePositioningRecommendationsAction(slug);
        setRecommendationsData(regeneratedRecommendations);
        setAvailableArtifacts((prev) => ({ ...prev, recommendations: true }));
      } else if (sectionId === "book-promise") {
        const regeneratedReport = await compileBookPromiseReportAction(slug);
        setBookPromiseReportData(regeneratedReport);
        setAvailableArtifacts((prev) => ({ ...prev, bookPromiseReport: true }));
      }

      // Reset approval status for this section
      setApprovalStatuses((prev) => ({
        ...prev,
        [sectionId as PromiseTabName]: "pending",
      }));
      setApprovalFeedback((prev) => ({
        ...prev,
        [sectionId as PromiseTabName]: "",
      }));
    } catch (error) {
      console.error("Regeneration failed:", error);
      throw error;
    } finally {
      setIsGenerating((prev) => ({ ...prev, [phaseId]: false }));
      setIsOptimizing(false);
    }
  };

  const handleSavePromise = async () => {
    await savePromiseStatement(slug, editingPromise);
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
    }, 500);
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
      const allFeedback = [
        ...validationScores.personaMatch.feedback,
        ...validationScores.marketViability.feedback,
        ...validationScores.promiseQuality.feedback,
        ...validationScores.triangulation.gaps,
        ...validationScores.triangulation.suggestions,
      ];

      const refined = await refinePomiseWithAI(slug, editingPromise, allFeedback);

      if (refined && refined !== editingPromise) {
        setEditingPromise(refined);
        alert("✓ Promise refined! Review changes and click Save Promise.");
      } else if (refined === editingPromise) {
        alert("Promise is already strong. Check the score details for specific improvements needed.");
      } else {
        alert("Could not refine promise. Check console for details.");
      }
    } catch (error) {
      console.error("Refinement failed:", error);
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
        await autoGeneratePersonasAction(slug);
        alert("✓ Personas auto-generated! Validate again to see updated scores.");
      } else if (type === "market") {
        const refreshedMarket = await generateMarketAnalysisAction(slug);
        setMarketData(refreshedMarket);
        alert("✓ Market analysis optimized! Validate again to see updated scores.");
      }

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

  // Build section status array for tracker
  const sectionStatuses: SectionStatus[] = tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    status: approvalStatuses[tab.id],
  }));

  // Determine if all sections are approved
  const allApproved = Object.values(approvalStatuses).every((status) => status === "approved");

  const markSectionPending = (sectionId: PromiseTabName) => {
    setApprovalStatuses((prev) => ({
      ...prev,
      [sectionId]: "pending",
    }));
    setApprovalFeedback((prev) => ({
      ...prev,
      [sectionId]: "",
    }));
  };

  const activeArtifactMetadata: PromiseArtifactMetadata | undefined =
    activeTab === "promise-statement"
      ? promise.metadata
      : activeTab === "audience"
        ? audienceData?.metadata
        : activeTab === "truth"
          ? truthData?.metadata
          : activeTab === "transformation"
            ? transformationData?.metadata
            : activeTab === "market"
              ? marketData?.metadata
              : activeTab === "recommendations"
                ? recommendationsData?.metadata
                : bookPromiseReportData?.metadata;

  return (
    <div style={styles.container}>
      {/* Section Status Tracker */}
      <div style={styles.trackerSection}>
        <SectionStatusTracker
          sections={sectionStatuses}
          isGenerating={isGenerating}
          onSectionClick={(sectionId) => setActiveTab(sectionId as PromiseTabName)}
        />
      </div>

      {/* Tabs Bar */}
      <div style={styles.tabsBar}>
        {tabs.map((tab) => {
          const isUnlocked = isTabUnlocked(tab.id);
          const status = approvalStatuses[tab.id];
          const isGen = isGenerating[tab.id];

          // Determine status indicator color
          let statusColor = "#ef4444"; // Red (pending)
          if (isGen) statusColor = "#f59e0b"; // Yellow (generating)
          if (status === "approved") statusColor = "#16a34a"; // Green (approved)

          return (
            <button
              key={tab.id}
              onClick={() => isUnlocked && setActiveTab(tab.id)}
              disabled={!isUnlocked}
              style={{
                ...styles.tab,
                ...(activeTab === tab.id ? styles.tabActive : {}),
                opacity: isUnlocked ? 1 : 0.4,
                cursor: isUnlocked ? "pointer" : "not-allowed",
              }}
              title={!isUnlocked ? `Complete step ${tab.stepNumber - 1} to unlock` : ""}
            >
              <span style={{ fontSize: "12px", color: "#999", marginRight: "4px" }}>
                ({tab.stepNumber}/7)
              </span>
              <span>{tab.label}</span>
              <span style={{ color: statusColor, marginLeft: "8px", fontSize: "14px" }}>
                {isGen ? "🟡" : status === "approved" ? "🟢" : "🔴"}
              </span>
            </button>
          );
        })}

        {/* Export Menu (Top Right) */}
        <div style={styles.exportContainer}>
          <ExportMenu
            slug={slug}
            bookTitle={currentBookTitle}
            bookPromiseReport={bookPromiseReportData}
            promiseData={{
              promiseStatement: editingPromise,
              audiencePrimary: promise.audiencePrimary,
              audienceSecondary: promise.audienceSecondary,
              coreTruth: promise.coreTruth,
              readerProblem: promise.readerProblem,
              readerDesire: promise.readerDesire,
              transformationBefore: promise.transformationBefore,
              transformationAfter: promise.transformationAfter,
              marketCategory: marketData?.marketCategory,
            }}
          />
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        <div style={styles.usagePanel}>
          <div style={styles.usageLabel}>Model Usage</div>
          <div style={styles.usageValue}>{getUsageLabel(activeArtifactMetadata)}</div>
          <div style={styles.usageHint}>
            Manual edits show `manual-edit`. Token counts appear when the section was generated by a tracked model call.
          </div>
        </div>

        {/* PROMISE STATEMENT TAB */}
        {activeTab === "promise-statement" && (
          <div style={styles.tabContent}>
            <PromiseStatementContainer
              slug={slug}
              promise={{
                ...promise,
                promiseStatement: editingPromise,
              }}
              isGenerating={isGenerating["promise-statement"]}
              approvalStatus={approvalStatuses["promise-statement"]}
              approvalFeedback={approvalFeedback["promise-statement"]}
              onApprove={handleApproveSection}
              onReject={handleRejectSection}
              onRegenerate={handleRegenerateSection}
              onGeneratingStatusChange={(isGen) => setIsGenerating((prev) => ({ ...prev, "promise-statement": isGen }))}
              onPromiseChange={setEditingPromise}
              messages={messages}
            />
          </div>
        )}

        {/* AUDIENCE TAB */}
        {activeTab === "audience" && (
          <div style={styles.tabContent}>
            <AudienceResearchContainer
              slug={slug}
              initialData={audienceData}
              onApprove={handleApproveSection}
              onReject={handleRejectSection}
              onRegenerate={handleRegenerateSection}
              approvalStatus={approvalStatuses.audience}
              approvalFeedback={approvalFeedback.audience}
              onDataChange={setAudienceData}
            />
          </div>
        )}

        {/* TRUTH TAB */}
        {activeTab === "truth" && (
          <div style={styles.tabContent}>
            <TruthPhaseContainer
              slug={slug}
              data={truthData}
              isGenerating={isGenerating.truth}
              approvalStatus={approvalStatuses.truth}
              approvalFeedback={approvalFeedback.truth}
              onApprove={handleApproveSection}
              onReject={handleRejectSection}
              onRegenerate={handleRegenerateSection}
              onDataChange={setTruthData}
            />
          </div>
        )}

        {/* TRANSFORMATION TAB */}
        {activeTab === "transformation" && (
          <div style={styles.tabContent}>
            <TransformationPhaseContainer
              slug={slug}
              data={transformationData}
              isGenerating={isGenerating.transformation}
              approvalStatus={approvalStatuses.transformation}
              approvalFeedback={approvalFeedback.transformation}
              onApprove={handleApproveSection}
              onReject={handleRejectSection}
              onRegenerate={handleRegenerateSection}
              onDataChange={setTransformationData}
            />
          </div>
        )}

        {/* MARKET TAB */}
        {activeTab === "market" && (
          <div style={styles.tabContent}>
            <MarketPhaseContainer
              slug={slug}
              title={promise.workingTitle}
              data={marketData}
              isGenerating={isGenerating.market}
              approvalStatus={approvalStatuses.market}
              approvalFeedback={approvalFeedback.market}
              onApprove={handleApproveSection}
              onReject={handleRejectSection}
              onRegenerate={handleRegenerateSection}
              onDataChange={setMarketData}
            />
          </div>
        )}

        {/* RECOMMENDATIONS TAB */}
        {activeTab === "recommendations" && (
          <div style={styles.tabContent}>
            <RecommendationsPhaseContainer
              slug={slug}
              data={recommendationsData}
              titleSubtitleFinalization={titleSubtitleData}
              isGenerating={isGenerating.recommendations}
              approvalStatus={approvalStatuses.recommendations}
              approvalFeedback={approvalFeedback.recommendations}
              onApprove={handleApproveSection}
              onReject={handleRejectSection}
              onRegenerate={handleRegenerateSection}
              onDataChange={setRecommendationsData}
              onTitleSubtitleFinalizationChange={(data) => {
                setTitleSubtitleData(data);
                setCurrentBookTitle(data.finalizedTitle);
                markSectionPending("book-promise");
              }}
              onInvalidateApproval={(sectionId) =>
                markSectionPending(sectionId as PromiseTabName)
              }
            />
          </div>
        )}

        {/* BOOK PROMISE TAB */}
        {activeTab === "book-promise" && (
          <div style={styles.tabContent}>
            <BookPitchPhaseContainer
              slug={slug}
              data={bookPromiseReportData}
              shouldRefresh={bookPitchStaleAfterTitleFinalization}
              isGenerating={isGenerating["book-promise"]}
              approvalStatus={approvalStatuses["book-promise"]}
              approvalFeedback={approvalFeedback["book-promise"]}
              onApprove={handleApproveSection}
              onReject={handleRejectSection}
              onRegenerate={handleRegenerateSection}
              onDataChange={setBookPromiseReportData}
              onInvalidateApproval={(sectionId) =>
                markSectionPending(sectionId as PromiseTabName)
              }
            />
          </div>
        )}
      </div>

      {/* Final Commit Banner */}
      {allApproved && (
        <div style={styles.commitBanner}>
          <div style={styles.commitContent}>
            <h3 style={styles.commitTitle}>🎉 All Sections Approved!</h3>
            <p style={styles.commitDescription}>
              Your Book Pitch is complete and ready to commit. Click the button below to proceed to the Outline stage.
            </p>
          </div>
          <form action={commitPromiseStage.bind(null, slug)}>
            <button
              type="submit"
              style={styles.commitButton}
              title="Commit this Promise and move to Outline stage"
            >
              ✓ Commit Promise
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex" as const,
    flexDirection: "column" as const,
    height: "100%",
    backgroundColor: "var(--panel, #fefbf5)",
  },
  trackerSection: {
    padding: "16px 32px",
    backgroundColor: "var(--panel, #fefbf5)",
    borderBottom: "1px solid rgba(45, 36, 29, 0.1)",
  },
  tabsBar: {
    display: "flex" as const,
    gap: "8px",
    padding: "12px 16px",
    borderBottom: "1px solid rgba(45, 36, 29, 0.1)",
    backgroundColor: "var(--paper, #fbf6ef)",
    overflowX: "auto" as const,
    flexShrink: 0,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  tab: {
    padding: "8px 16px",
    backgroundColor: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    color: "var(--muted, #6f6256)",
    fontSize: "13px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
    whiteSpace: "nowrap" as const,
    display: "flex" as const,
    alignItems: "center" as const,
    gap: "6px",
  },
  tabActive: {
    color: "var(--accent, #16384f)",
    borderBottom: "2px solid var(--accent, #16384f)",
  },
  tabCheckmark: {
    fontSize: "12px",
    color: "#16a34a",
  },
  exportContainer: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
  },
  content: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "32px",
    display: "flex" as const,
    flexDirection: "column" as const,
  },
  usagePanel: {
    maxWidth: "900px",
    width: "100%",
    margin: "0 auto 20px",
    padding: "12px 16px",
    borderRadius: "10px",
    backgroundColor: "rgba(22, 56, 79, 0.06)",
    border: "1px solid rgba(22, 56, 79, 0.12)",
    display: "grid" as const,
    gap: "4px",
  },
  usageLabel: {
    fontSize: "11px",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "var(--muted, #6f6256)",
    fontWeight: 700,
  },
  usageValue: {
    fontSize: "13px",
    color: "var(--ink, #2d241d)",
    fontWeight: 600,
  },
  usageHint: {
    fontSize: "12px",
    color: "var(--muted, #6f6256)",
    lineHeight: 1.4,
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
  truthBox: {
    padding: "24px",
    backgroundColor: "rgba(22, 163, 74, 0.05)",
    border: "1px solid rgba(22, 163, 74, 0.2)",
    borderRadius: "12px",
    marginBottom: "24px",
  },
  truthStatement: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 600,
    color: "#2d241d",
    lineHeight: 1.8,
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
  personas: {
    display: "grid" as const,
    gap: "20px",
    marginTop: "20px",
  },
  marketSection: {
    display: "grid" as const,
    gap: "20px",
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
  commitBanner: {
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: "24px",
    padding: "20px 32px",
    backgroundColor: "#dcfce7",
    borderTop: "2px solid rgba(22, 163, 74, 0.3)",
    flexShrink: 0,
  },
  commitContent: {
    flex: 1,
  },
  commitTitle: {
    margin: "0 0 4px",
    fontSize: "16px",
    fontWeight: 700,
    color: "#166534",
  },
  commitDescription: {
    margin: 0,
    fontSize: "13px",
    color: "#15803d",
    lineHeight: 1.5,
  },
  commitButton: {
    padding: "12px 28px",
    backgroundColor: "#16a34a",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    transition: "all 0.2s",
  } as const,
  placeholderBox: {
    padding: "24px",
    backgroundColor: "rgba(59, 44, 31, 0.04)",
    border: "2px dashed rgba(59, 44, 31, 0.2)",
    borderRadius: "8px",
    marginTop: "24px",
  } as const,
  placeholderText: {
    margin: 0,
    fontSize: "14px",
    color: "rgba(59, 44, 31, 0.6)",
    fontStyle: "italic" as const,
    textAlign: "center" as const,
  } as const,
};
