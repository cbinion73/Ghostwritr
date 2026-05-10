import Link from "next/link";
import {
  commitPromiseStage,
  seedPromiseWorkspace,
  togglePromiseReferenceMaterial,
  refinePromiseToExcellence,
} from "./actions";
import { ChatSidebar } from "./chat-sidebar";
import { PromiseWizard } from "./promise-wizard";
import { PromiseTabs } from "./promise-tabs";
import { RefineButton } from "./refine-button";

import type { PromiseBrief } from "@/lib/promise-types";
import { getPromiseWorkspace } from "@/lib/workflows/promise";
import { STAGE_LINKS } from "@/lib/navigation";

export default async function PromiseStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ wizard?: string }>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const workspace = await getPromiseWorkspace(slug);
  const isCommitted = workspace.stage?.status === "COMMITTED";
  const allPromiseSectionsApproved = Object.values(workspace.phaseApprovals).every(
    (phase) => phase.status === "approved",
  );

  // Show wizard only if explicitly requested via ?wizard=true query param
  const showWizard = resolvedSearchParams?.wizard === "true";

  return (
    <>
      <div style={styles.pageContainer}>
      {/* Left Navigation Sidebar */}
      <aside style={styles.navSidebar} className="glass-panel">
        <div style={styles.brandMark}>
          <h1 style={styles.brandTitle}>GHOSTWRITR</h1>
          <p style={styles.brandDescription}>
            Research and refine the book's strategic foundation before drafting begins.
          </p>
        </div>

        <div style={styles.bookInfo}>
          <div style={styles.infoItem}>
            <strong>{workspace.book.titleWorking ?? "Untitled"}</strong>
          </div>
          <div style={styles.infoItem}>
            Status: <strong>{workspace.stage?.status ?? "IN_PROGRESS"}</strong>
          </div>
        </div>

        <nav style={styles.stageList}>
          {STAGE_LINKS.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href(slug)}
              style={{
                ...styles.stageLink,
                ...(stage.key === "PROMISE" ? styles.stageLinkActive : {}),
              }}
            >
              {stage.label}
            </Link>
          ))}
        </nav>

        <div style={styles.actionsBottom}>
          <RefineButton slug={slug} />
          <form action={seedPromiseWorkspace.bind(null, slug)}>
            <button style={styles.btnSmall} type="submit">
              Seed Sample
            </button>
          </form>
          <form action={commitPromiseStage.bind(null, slug)}>
            <button
              disabled={!isCommitted && !allPromiseSectionsApproved}
              style={{ ...styles.btnSmall, ...styles.btnPrimary }}
              type="submit"
            >
              {isCommitted ? "Recommit" : "Commit Promise"}
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main style={styles.mainContent}>
        {/* Top Bar */}
        <div style={styles.topBar} className="glass-panel">
          <div>
            <div style={styles.label}>Stage Workspace</div>
            <h2 style={styles.stageTitle}>Promise</h2>
            <p style={styles.stageDescription}>
              Research, refine, and validate the book's core direction conversationally.
            </p>
          </div>
          <Link style={styles.btnLink} href={`/books/${slug}/files`}>
            📁 Files
          </Link>
        </div>

        {/* Promise Tabs */}
        <section style={styles.tabsSection} className="glass-panel">
          <PromiseTabs
            slug={slug}
            promise={workspace.promiseBrief || {
              workingTitle: workspace.book.titleWorking || "Untitled",
              audiencePrimary: "",
              audienceSecondary: [],
              category: "",
              readerProblem: "",
              readerDesire: "",
              bigIdea: "",
              coreTruth: "",
              transformationBefore: "",
              transformationAfter: "",
              differentiation: "",
              promiseStatement: "",
              stakes: "",
              tone: [],
              openQuestions: [],
            }}
            personas={workspace.personas}
            market={workspace.market}
            recommendations={workspace.recommendations}
            audienceResearch={workspace.audienceResearch}
            coreTruths={workspace.coreTruths}
            transformationArc={workspace.transformationArc}
            titleSubtitleFinalization={workspace.titleSubtitleFinalization}
            bookPromiseReport={workspace.bookPromiseReport}
            phaseApprovals={workspace.phaseApprovals}
            artifactAvailability={workspace.artifactAvailability}
            messages={workspace.conversationMessages}
          />
        </section>
      </main>

      {/* Chat Sidebar */}
      <ChatSidebar
        slug={slug}
        messages={workspace.conversationMessages}
      />
      </div>

      {/* Promise Wizard Modal */}
      {showWizard && <PromiseWizard slug={slug} />}
    </>
  );
}

const styles = {
  pageContainer: {
    display: "grid" as const,
    gridTemplateColumns: "240px 1fr 360px",
    height: "100vh",
    width: "100vw",
    backgroundColor: "var(--bg, #efe6d6)",
  },
  navSidebar: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "24px",
    padding: "20px",
    borderRight: "1px solid rgba(45, 36, 29, 0.1)",
    overflowY: "auto" as const,
    position: "sticky" as const,
    top: 0,
    height: "100vh",
  },
  brandMark: {
    borderBottom: "1px solid rgba(45, 36, 29, 0.1)",
    paddingBottom: "16px",
  },
  brandTitle: {
    margin: "0 0 8px",
    fontSize: "18px",
    fontWeight: 700,
    color: "var(--ink, #2d241d)",
  },
  brandDescription: {
    margin: 0,
    fontSize: "12px",
    color: "var(--muted, #6f6256)",
    lineHeight: 1.4,
  },
  bookInfo: {
    display: "grid" as const,
    gap: "8px",
    fontSize: "13px",
    color: "var(--muted, #6f6256)",
  },
  infoItem: {
    padding: "8px 0",
  },
  stageList: {
    display: "grid" as const,
    gap: "8px",
    flex: 1,
  },
  stageLink: {
    padding: "10px 12px",
    borderRadius: "6px",
    backgroundColor: "transparent",
    color: "var(--muted, #6f6256)",
    textDecoration: "none",
    fontSize: "13px",
    transition: "all 0.2s",
    border: "1px solid transparent",
    cursor: "pointer",
  },
  stageLinkActive: {
    backgroundColor: "var(--accent, #16384f)",
    color: "white",
    border: "1px solid var(--accent, #16384f)",
  },
  actionsBottom: {
    display: "grid" as const,
    gap: "8px",
    marginTop: "auto",
    paddingTop: "16px",
    borderTop: "1px solid rgba(45, 36, 29, 0.1)",
  },
  mainContent: {
    display: "grid" as const,
    gridTemplateRows: "auto 1fr",
    gap: "20px",
    padding: "20px",
    overflowY: "auto" as const,
    height: "100%",
    width: "100%",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: "20px",
    gap: "20px",
  },
  label: {
    fontSize: "12px",
    color: "var(--muted, #6f6256)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  stageTitle: {
    margin: "4px 0 8px",
    fontSize: "24px",
    fontWeight: 600,
    color: "var(--ink, #2d241d)",
  },
  stageDescription: {
    margin: 0,
    fontSize: "14px",
    color: "var(--muted, #6f6256)",
  },
  btnLink: {
    padding: "10px 16px",
    backgroundColor: "var(--accent, #16384f)",
    color: "white",
    borderRadius: "6px",
    textDecoration: "none",
    fontSize: "14px",
    cursor: "pointer",
  },
  tabsSection: {
    display: "flex" as const,
    flexDirection: "column" as const,
    backgroundColor: "var(--panel, #fefbf5)",
    minHeight: 0,
    flex: 1,
  },
  btnSmall: {
    padding: "8px 12px",
    backgroundColor: "var(--paper, #fbf6ef)",
    color: "var(--ink, #2d241d)",
    border: "1px solid rgba(45, 36, 29, 0.2)",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
  },
  btnPrimary: {
    backgroundColor: "var(--accent, #16384f)",
    color: "white",
    border: "1px solid var(--accent, #16384f)",
  },
};
