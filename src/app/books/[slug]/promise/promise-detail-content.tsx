/**
 * The Verdict room — Promise stage content, shared between the Book Studio
 * (rendered as the PROMISE stage slot) and the retired standalone view.
 * Server component: fetches the promise workspace itself.
 *
 * Includes the real 7-phase approval mechanism (PromiseTabs) — distinct
 * from the generic AgentChatPanel used by most other stages — plus the
 * gate verdict band and the commit/seed/refine decision rail.
 */

import {
  commitPromiseStage,
  seedPromiseWorkspace,
} from "./actions";
import { ChatSidebar } from "./chat-sidebar";
import { Phase1GuidedJourneyPanel } from "./phase1-guided-journey-panel";
import { PromiseTabs } from "./promise-tabs";
import { RefineButton } from "./refine-button";
import { VerdictPanel } from "./verdict-panel";

import { getPromiseWorkspace } from "@/lib/workflows/promise-public";
import styles from "./promise-detail-content.module.css";

export async function PromiseDetailContent({ slug }: { slug: string }) {
  const workspace = await getPromiseWorkspace(slug);
  const isCommitted = workspace.stage?.status === "COMMITTED";
  const allPromiseSectionsApproved = Object.values(workspace.phaseApprovals).every(
    (phase) => phase.status === "approved",
  );

  return (
    <div className={styles.verdictRoom} style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
      <div className={styles.promiseMain} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
        <section className={styles.promiseHero} style={{ padding: "6px 4px 0", flexShrink: 0 }}>
          <div className={styles.eyebrow}>The Promise Room · Foundation Gate 02</div>
          <h2 style={{ margin: "8px 0 4px", fontSize: "1.6rem", fontWeight: 600 }}>Make the book irresistible before making it long.</h2>
          <p className="muted" style={{ margin: 0, fontStyle: "italic", maxWidth: "60ch", fontSize: 13 }}>
            The market-viability assay. Five dimensions, one composite verdict — the
            book does not advance past this desk until the promise clears the gate.
          </p>
        </section>

        <div className={styles.verdictWell} style={{ padding: "10px 4px 0", flexShrink: 0 }}>
          <VerdictPanel scorecard={workspace.scorecard} committed={isCommitted} />
        </div>

        <Phase1GuidedJourneyPanel slug={slug} workspace={workspace} />

        {/* Promise working material (conversation-built artifacts) */}
        <section
          className={`glass-panel ${styles.promiseWorkbench}`}
          style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1, margin: "10px 4px 4px" }}
        >
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

        {/* Decision rail — a gate, not a report */}
        <div className={styles.decisionRail} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", flexShrink: 0, borderTop: "1px solid var(--line)" }}>
          <span className={styles.decisionLabel} style={{ color: "var(--muted)", marginRight: "auto" }}>
            Your decision <small>This stage is a gate</small>
          </span>
          <RefineButton slug={slug} />
          <form action={seedPromiseWorkspace.bind(null, slug)}>
            <button className="btn" type="submit">Seed Sample</button>
          </form>
          <form action={commitPromiseStage.bind(null, slug)}>
            <button
              disabled={!isCommitted && !allPromiseSectionsApproved}
              className="btn btn-primary"
              type="submit"
              title={
                !isCommitted && !allPromiseSectionsApproved
                  ? "Approve every promise section before committing"
                  : undefined
              }
            >
              {isCommitted ? "Recommit" : "Commit Promise & Proceed"}
            </button>
          </form>
        </div>
      </div>

      {/* Refine — free-text conversational companion, distinct from the tab flow above */}
      <ChatSidebar slug={slug} messages={workspace.conversationMessages} />
    </div>
  );
}
