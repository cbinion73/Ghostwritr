import Link from "next/link";
import {
  commitPromiseStage,
  saveFinalPromiseStatement,
  seedPromiseWorkspace,
  togglePromiseReferenceMaterial,
} from "./actions";
import { CollapsibleConversationPanel } from "./collapsible-conversation-panel";
import { PromiseWizard } from "./promise-wizard";

import type { PromiseBrief } from "@/lib/promise-types";
import { getPromiseWorkspace } from "@/lib/workflows/promise";
import { STAGE_LINKS } from "@/lib/navigation";

export default async function PromiseStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getPromiseWorkspace(slug);
  const isCommitted = workspace.stage?.status === "COMMITTED";
  const hasConversation = workspace.conversationMessages.length > 0;

  // Show wizard if no conversation started yet
  if (!hasConversation) {
    return <PromiseWizard slug={slug} />;
  }

  return (
    <div style={styles.pageContainer}>
      {/* Left Sidebar */}
      <aside style={styles.sidebar} className="glass-panel">
        <div style={styles.brandMark}>
          <h1 style={styles.brandTitle}>GHOSTWRITR</h1>
          <p style={styles.brandDescription}>
            Book promise refinement workspace
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
          <form action={seedPromiseWorkspace.bind(null, slug)}>
            <button style={styles.btnSmall} type="submit">
              Seed Sample
            </button>
          </form>
          <form action={commitPromiseStage.bind(null, slug)}>
            <button style={{ ...styles.btnSmall, ...styles.btnPrimary }} type="submit">
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
            <h2 style={styles.stageTitle}>Book Promise</h2>
            <p style={styles.stageDescription}>
              Refine the promise conversationally
            </p>
          </div>
          <Link style={styles.btnLink} href={`/books/${slug}/files`}>
            📁 Files
          </Link>
        </div>

        {/* Promise Document */}
        <section style={styles.documentSection} className="glass-panel">
          <div style={styles.documentHeader}>
            <h3 style={styles.documentTitle}>Final Book Promise</h3>
            <form action={saveFinalPromiseStatement.bind(null, slug)}>
              <div style={styles.documentFormGroup}>
                <textarea
                  name="promiseStatement"
                  defaultValue={workspace.promiseBrief.promiseStatement}
                  style={styles.documentTextarea}
                  placeholder="Write your book promise here..."
                />
                <button style={styles.btnPrimary} type="submit">
                  Save
                </button>
              </div>
            </form>
          </div>

          {/* Supporting Fields */}
          <div style={styles.supportingFields}>
            <div style={styles.fieldGroup}>
              <strong>Primary Audience</strong>
              <p style={styles.fieldValue}>
                {workspace.promiseBrief.audiencePrimary}
              </p>
            </div>
            <div style={styles.fieldGroup}>
              <strong>Core Truth</strong>
              <p style={styles.fieldValue}>
                {workspace.promiseBrief.coreTruth}
              </p>
            </div>
            <div style={styles.fieldGroup}>
              <strong>Transformation</strong>
              <p style={styles.fieldValue}>
                From <em>{workspace.promiseBrief.transformationBefore}</em> to{" "}
                <em>{workspace.promiseBrief.transformationAfter}</em>
              </p>
            </div>
          </div>

          {/* Reference Materials */}
          {workspace.sourceDocuments.length > 0 && (
            <div style={styles.referenceSection}>
              <strong>Active Reference Materials</strong>
              <div style={styles.referenceList}>
                {workspace.sourceDocuments
                  .filter((doc) => doc.enabled)
                  .map((doc) => (
                    <div key={doc.id} style={styles.referenceItem}>
                      {doc.title}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Collapsible Conversation Panel */}
      <CollapsibleConversationPanel
        slug={slug}
        messages={workspace.conversationMessages}
      />
    </div>
  );
}

const styles = {
  pageContainer: {
    display: "grid" as const,
    gridTemplateColumns: "240px 1fr",
    minHeight: "100vh",
    backgroundColor: "var(--bg, #efe6d6)",
  },
  sidebar: {
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
    borderColor: "var(--accent, #16384f)",
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
  documentSection: {
    display: "grid" as const,
    gap: "24px",
    padding: "32px",
    backgroundColor: "var(--panel, #fefbf5)",
  },
  documentHeader: {
    display: "grid" as const,
    gap: "16px",
  },
  documentTitle: {
    margin: 0,
    fontSize: "18px",
    fontWeight: 600,
    color: "var(--ink, #2d241d)",
  },
  documentFormGroup: {
    display: "grid" as const,
    gap: "12px",
  },
  documentTextarea: {
    padding: "16px",
    borderRadius: "8px",
    border: "2px solid rgba(45, 36, 29, 0.1)",
    fontFamily: "inherit",
    fontSize: "16px",
    lineHeight: 1.6,
    minHeight: "180px",
    resize: "vertical" as const,
    color: "var(--ink, #2d241d)",
  },
  supportingFields: {
    display: "grid" as const,
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "20px",
    paddingTop: "20px",
    borderTop: "1px solid rgba(45, 36, 29, 0.1)",
  },
  fieldGroup: {
    display: "grid" as const,
    gap: "8px",
  },
  fieldValue: {
    margin: 0,
    fontSize: "14px",
    lineHeight: 1.6,
    color: "var(--ink, #2d241d)",
  },
  referenceSection: {
    paddingTop: "16px",
    borderTop: "1px solid rgba(45, 36, 29, 0.1)",
  },
  referenceList: {
    display: "grid" as const,
    gap: "8px",
    marginTop: "8px",
  },
  referenceItem: {
    padding: "8px 12px",
    backgroundColor: "var(--paper, #fbf6ef)",
    borderRadius: "4px",
    fontSize: "13px",
    color: "var(--ink, #2d241d)",
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
    borderColor: "var(--accent, #16384f)",
  },
};
