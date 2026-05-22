import Link from "next/link";
import { AppTopBar } from "@/app/components/app-top-bar";
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
      <div className="dark-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <AppTopBar bookSlug={slug} bookTitle={workspace.book.titleWorking ?? undefined} activePage="studio" />
        <div className="page-shell" style={{ flex: 1 }}>
      {/* Left Navigation Sidebar */}
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Research and refine the book&apos;s strategic foundation before drafting begins.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Status: <strong>{workspace.stage?.status ?? "IN_PROGRESS"}</strong>
          </div>
        </div>

        <div className="stage-list">
          {STAGE_LINKS.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href(slug)}
              className={`stage-chip${stage.key === "PROMISE" ? " active" : ""}`}
            >
              {stage.label}
            </Link>
          ))}
        </div>

        <div style={styles.actionsBottom}>
          <RefineButton slug={slug} />
          <form action={seedPromiseWorkspace.bind(null, slug)}>
            <button className="btn" type="submit">
              Seed Sample
            </button>
          </form>
          <form action={commitPromiseStage.bind(null, slug)}>
            <button
              disabled={!isCommitted && !allPromiseSectionsApproved}
              className="btn btn-primary"
              type="submit"
            >
              {isCommitted ? "Recommit" : "Commit Promise"}
            </button>
          </form>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-column">
        {/* Top Bar */}
        <section className="glass-panel topbar">
          <div>
            <div className="label">Stage Workspace</div>
            <h2>Promise</h2>
            <p className="muted">
              Research, refine, and validate the book&apos;s core direction conversationally.
            </p>
          </div>
          <div className="button-row">
            <Link className="btn" href={`/books/${slug}`}>
              ← Book Studio
            </Link>
            <Link className="btn" href={`/books/${slug}/files`}>
              Files
            </Link>
          </div>
        </section>

        {/* Promise Tabs */}
        <section className="glass-panel" style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
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
      </div>

      {/* Promise Wizard Modal */}
      {showWizard && <PromiseWizard slug={slug} />}
    </>
  );
}

const styles = {
  actionsBottom: {
    display: "grid" as const,
    gap: "8px",
    marginTop: "auto",
    paddingTop: "16px",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
};
