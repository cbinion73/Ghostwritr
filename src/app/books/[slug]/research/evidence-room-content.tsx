/**
 * The Evidence Room — Research stage content, shared between the Book Studio
 * (rendered as the RESEARCH stage slot) and any standalone view. Server
 * component: fetches the research workspace itself.
 *
 * tabHrefBase controls where binder-tab links navigate, so the Studio can
 * keep the user inside the Studio (?stage=RESEARCH&tabId=...).
 */

import Link from "next/link";

import {
  commitAllResearch,
  commitSelectedResearchDossier,
  retryResearchStage,
  runFullResearchStage,
  runSelectedResearchDossier,
  stopResearchStage,
} from "./actions";
import { ResearchProgressBar } from "@/app/books/research-progress-bar";
import { SubmitButton } from "@/app/components/submit-button";
import { StageRunPanel } from "@/app/components/stage-run-panel";

import { getStaleDependencyRecoveryHint, getStaleDependencyState } from "@/lib/stale-dependency";
import { buildResearchEvidenceContract } from "@/lib/source-evidence-contract";

function tierClassName(tier: string) {
  return `tier-badge tier-${tier.toLowerCase()}`;
}

function dossierStatusLabel(status: string) {
  switch (status) {
    case "COMMITTED":
      return "Committed";
    case "NEEDS_REVIEW":
      return "Needs review";
    case "DRAFT":
      return "Draft";
    default:
      return "Empty";
  }
}

function findChapterLabel(
  availableChapters: Array<{ chapterKey: string; chapterLabel: string }>,
  chapterKey: string | null,
) {
  if (!chapterKey) {
    return null;
  }

  return availableChapters.find((chapter) => chapter.chapterKey === chapterKey)?.chapterLabel ?? chapterKey;
}

function progressPercent(completed: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

type ClaimListItem = {
  id: string;
  claimText: string;
};

export async function EvidenceRoomContent({
  slug,
  tabId,
  tabHrefBase,
}: {
  slug: string;
  tabId?: string;
  tabHrefBase: string;
}) {
  const { getResearchWorkspace } = await import("@/lib/workflows/research-public");
  const workspace = await getResearchWorkspace(slug, tabId);
  const selectedTab = workspace.selectedTab;
  const hasGeneratedResearch = workspace.tabs.some((tab) => tab.summary.generatedCount > 0);
  const canGenerateResearch = workspace.availableChapters.length > 0 && workspace.baseStoryReady;
  const staleDependency = getStaleDependencyState(workspace.stage?.metadataJson);

  return (
      <main className="main-column">
        {/* ── Holding banner: a dependency is blocking downstream work ── */}
        {staleDependency ? (
          <section style={holdBannerStyle}>
            <span className="microlabel" style={{ color: "var(--rust)" }}>Evidence hold</span>
            <div style={{ marginTop: 6, color: "var(--rust)", fontStyle: "italic" }}>
              {staleDependency.reason}
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: "0.9rem" }}>
              Recommended recovery: {getStaleDependencyRecoveryHint(workspace.stage?.stageKey)}
            </div>
          </section>
        ) : null}

        <section className="glass-panel topbar">
          <div>
            <div className="microlabel" style={{ color: "var(--muted)" }}>
              Part Two · Structure / The Evidence Room
            </div>
            <h2 style={{ margin: "6px 0" }}>Research</h2>
            <div className="muted" style={{ fontStyle: "italic" }}>
              Every claim earns its place here before a chapter may cite it. Each binder
              tab holds a chapter dossier — sources tiered, claims verified, gaps on file.
            </div>
            {workspace.invalidArtifactWarnings.length > 0 ? (
              <div className="muted" style={{ marginTop: 10 }}>
                <div>Artifact warning: {workspace.invalidArtifactWarnings.length} saved research dossier{workspace.invalidArtifactWarnings.length === 1 ? "" : "s"} could not be parsed safely.</div>
                <div style={{ marginTop: 6 }}>{workspace.invalidArtifactWarnings[0]}</div>
              </div>
            ) : null}
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}?stage=MANIFEST`}>
              Review sources for Quill →
            </Link>
            <Link className="btn" href={`/books/${slug}/outline`}>
              Back to Outline
            </Link>
            <Link className="btn" href={`/books/${slug}/dashboard`}>
              Open Dashboard
            </Link>
            <StageRunPanel
              stageLabel="Research"
              progressUrl={`/api/books/${slug}/research/progress`}
              generateAction={runFullResearchStage.bind(null, slug)}
              stopAction={stopResearchStage.bind(null, slug)}
              retryAction={retryResearchStage.bind(null, slug)}
              hasGenerated={hasGeneratedResearch}
              canGenerate={canGenerateResearch}
              initialStatus={workspace.stage?.status ?? "NOT_STARTED"}
              chapterLabels={Object.fromEntries(
                workspace.availableChapters.map((chapter) => [chapter.chapterKey, chapter.chapterLabel]),
              )}
              generateLabel="Generate Full Research"
              regenerateLabel="Regenerate Full Research"
            />
            {selectedTab ? (
              <>
                <form action={runSelectedResearchDossier.bind(null, slug)}>
                  <input name="tabId" type="hidden" value={selectedTab.id} />
                  <SubmitButton
                    className="btn"
                    label="Generate Selected Dossier"
                    pendingLabel="Generating..."
                  />
                </form>
                <form action={commitSelectedResearchDossier.bind(null, slug)}>
                  <input name="tabId" type="hidden" value={selectedTab.id} />
                  <SubmitButton
                    className="btn btn-primary"
                    label="Commit Selected Dossier"
                    pendingLabel="Committing..."
                  />
                </form>
                <form action={commitAllResearch.bind(null, slug)}>
                  <SubmitButton
                    className="btn btn-primary"
                    label="Commit All Research"
                    pendingLabel="Committing All..."
                  />
                </form>
              </>
            ) : null}
          </div>
        </section>

        <section className="glass-panel progress-section" style={{ marginBottom: "16px" }}>
          <div style={{ padding: "16px" }}>
            <h3 style={{ marginTop: 0, marginBottom: "16px" }}>Research Progress</h3>
            <ResearchProgressBar
              completedChapters={workspace.progress.completedChapters}
              totalChapters={workspace.progress.totalChapters}
              failedChapters={workspace.progress.failedChapters.length}
              provisionalChapters={workspace.progress.provisionalChapters.length}
            />
          </div>
        </section>

        <section className="glass-panel binder-panel">
          <div className="binder-tabs">
            {workspace.tabs.map((tab) => (
              <Link
                key={tab.id}
                href={`${tabHrefBase}&tabId=${tab.id}`}
                className={`binder-tab binder-${tab.colorToken} ${selectedTab?.id === tab.id ? "active" : ""}`}
              >
                <span>{tab.label}</span>
                <small>{tab.summary.chapterCount} dossier{tab.summary.chapterCount === 1 ? "" : "s"}</small>
                <div className="binder-meta">
                  <span className={`binder-status status-${tab.summary.status.toLowerCase()}`}>
                    {dossierStatusLabel(tab.summary.status)}
                  </span>
                  <span>{tab.summary.verifiedSourceCount} src</span>
                  <span>{tab.summary.verifiedItemCount} items</span>
                  <span>{tab.summary.ideaCount} ideas</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="workspace-grid research-workspace-grid">
          <section className="glass-panel section-panel paper-wrap">
            <article className="paper research-paper">
              <div className="toc-kicker">Binder Dossier</div>
              <h3>{selectedTab?.label ?? "Research Binder"}</h3>
              <div className="research-stage-progress">
                <div className="stage-progress-bar" aria-label="Research progress">
                  <div
                    className="stage-progress-fill"
                    style={{
                      width: `${progressPercent(
                        workspace.progress.completedChapters,
                        workspace.progress.totalChapters,
                      )}%`,
                    }}
                  />
                </div>
                <div className="metric">
                  Chapters completed: {workspace.progress.completedChapters}/
                  {workspace.progress.totalChapters}
                </div>
              {!canGenerateResearch ? (
                <div className="metric">
                  Commit the paragraph-level Outline and the Base Story before generating Research.
                </div>
              ) : null}
              <div className="metric">
                Stage state: {workspace.progress.automationStatus.replace(/_/g, " ")}
              </div>
              {workspace.progress.automationStatus === "running" ? (
                <div className="metric">
                  Research is running. Refresh manually to see the latest progress.
                </div>
              ) : null}
              {workspace.progress.currentChapterKey ? (
                <div className="metric">
                    Working on: {findChapterLabel(
                      workspace.availableChapters,
                      workspace.progress.currentChapterKey,
                    )}
                  </div>
                ) : null}
                {workspace.progress.failedChapters.length > 0 ? (
                  <div className="metric">
                    Failed: {workspace.progress.failedChapters.length}
                  </div>
                ) : null}
                {workspace.progress.provisionalChapters.length > 0 ? (
                  <div className="metric">
                    Provisional: {workspace.progress.provisionalChapters.length}
                  </div>
                ) : null}
              </div>

              {selectedTab ? (
                <div className="stack research-stack" style={{ padding: 0 }}>
                  <div className="card chapter-membership-card">
                    <h4>Tab Coverage</h4>
                    <div className="pill-row">
                      {selectedTab.chapterKeys.map((chapterKey) => {
                        const chapter = workspace.availableChapters.find(
                          (item) => item.chapterKey === chapterKey,
                        );

                        return (
                          <div className="pill" key={chapterKey}>
                            {chapter?.chapterLabel ?? chapterKey}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {workspace.dossierEntries.length > 0 ? (
                    workspace.dossierEntries.map((entry) => (
                      <section className="dossier-section" key={entry.chapter.chapterKey}>
                        <div className="dossier-heading">
                          <div>
                            <div className="label">Chapter Dossier</div>
                            <h4>{entry.chapter.chapterLabel}</h4>
                          </div>
                          <div className="muted">
                            {entry.version
                              ? `Version ${entry.version.versionNumber}`
                              : "Not generated yet"}
                          </div>
                        </div>

                        <p className="dossier-description">
                          {entry.dossier?.chapterDescription ??
                            "This chapter dossier has not been generated yet."}
                        </p>

                        {entry.dossier ? (
                          <>
                            {(() => {
                              const evidence = buildResearchEvidenceContract(
                                entry.dossier as Parameters<typeof buildResearchEvidenceContract>[0],
                              );
                              const admissibleFactIds = new Set(
                                evidence.records
                                  .filter((record) => record.admissibility === "ADMISSIBLE")
                                  .map((record) => record.id),
                              );
                              const admissibleFacts = entry.dossier.factBank.filter((item) =>
                                admissibleFactIds.has(item.id),
                              );

                              return (
                                <>
                            {entry.dossier.metadata?.provisional ? (
                              <div className="card" style={{ borderColor: "#b06733", background: "rgba(176, 103, 51, 0.08)" }}>
                                <strong>Provisional Research Dossier</strong>
                                <div className="muted" style={{ marginTop: 8 }}>
                                  {entry.dossier.metadata.warning ??
                                    "Generated without verified web sources. Use this as a scaffold, then retry once web access is configured."}
                                </div>
                              </div>
                            ) : null}

                            <div className="research-metrics">
                              <div className={`binder-status status-${entry.status.toLowerCase()}`}>
                                {dossierStatusLabel(entry.status)}
                              </div>
                              <div className="metric">
                                Verified sources: {entry.dossier.verificationSummary.verifiedSources}/
                                {entry.dossier.verificationSummary.totalSources}
                              </div>
                              <div className="metric">
                                Verified items: {entry.dossier.verificationSummary.verifiedItems}/
                                {entry.dossier.verificationSummary.totalItems}
                              </div>
                              <div className="metric">
                                Needs corroboration: {entry.dossier.verificationSummary.needsCorroborationItems}
                              </div>
                              <div className="metric">
                                Draft-admissible: {evidence.summary.admissibleRecords}
                              </div>
                              <div className="metric">
                                Excluded: {evidence.summary.excludedRecords}
                              </div>
                            </div>

                            {evidence.summary.excludedRecords > 0 ? (
                              <div className="card" style={{ borderColor: "#b06733", background: "rgba(176, 103, 51, 0.08)" }}>
                                <strong>Evidence warning</strong>
                                <div className="muted" style={{ marginTop: 8 }}>
                                  Some verified-looking items are blocked from Quill because they are
                                  missing source metadata, supporting excerpts, or verification status.
                                  Regenerate or repair the dossier before relying on them.
                                </div>
                              </div>
                            ) : null}

                            <details className="dossier-packet" open>
                              <summary>Research Questions</summary>
                              <div className="dossier-packet-body">
                                <ul className="clean-list">
                                  {entry.dossier.researchQuestions.map((question) => (
                                    <li key={question.id}>{question.question}</li>
                                  ))}
                                </ul>
                              </div>
                            </details>

                            <details className="dossier-packet" open>
                              <summary>Draft-Admissible Facts</summary>
                              <div className="dossier-packet-body">
                                {admissibleFacts.length > 0 ? (
                                  <ul className="clean-list">
                                    {admissibleFacts.map((item) => (
                                      <li key={item.id}>
                                        {item.claimText}
                                        {item.evidenceExcerpt ? (
                                          <div className="muted" style={{ marginTop: 4 }}>
                                            Excerpt: {item.evidenceExcerpt}
                                          </div>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="muted">
                                    No draft-admissible facts yet. Claims must have verified source
                                    metadata and a supporting excerpt before Quill can use them.
                                  </div>
                                )}
                              </div>
                            </details>

                            <div className="research-column-grid">
                              <details className="dossier-packet">
                                <summary>Statistics And Definitions</summary>
                                <div className="dossier-packet-body">
                                  <ul className="clean-list">
                                    {([...entry.dossier.statistics, ...entry.dossier.definitions] as ClaimListItem[])
                                      .slice(0, 6)
                                      .map((item) => (
                                        <li key={item.id}>{item.claimText}</li>
                                      ))}
                                  </ul>
                                </div>
                              </details>

                              <details className="dossier-packet">
                                <summary>Examples And Counterpoints</summary>
                                <div className="dossier-packet-body">
                                  <ul className="clean-list">
                                    {([...entry.dossier.examples, ...entry.dossier.counterpoints] as ClaimListItem[])
                                      .slice(0, 6)
                                      .map((item) => (
                                        <li key={item.id}>{item.claimText}</li>
                                      ))}
                                  </ul>
                                </div>
                              </details>
                            </div>

                            <details className="dossier-packet">
                              <summary>Source Register</summary>
                              <div className="dossier-packet-body source-register">
                                {entry.sources.length > 0 ? (
                                  entry.sources.map((source) => (
                                    <article className="source-card" key={source.id}>
                                      <div className="source-card-header">
                                        <div>
                                          <strong>{source.title}</strong>
                                          <div className="muted">
                                            {source.publisher ?? "Unknown publisher"}
                                          </div>
                                        </div>
                                        <span className={tierClassName(source.sourceTier)}>
                                          Tier {source.sourceTier}
                                        </span>
                                      </div>
                                      <div className="muted source-note">
                                        {source.verificationNotes ?? "Awaiting verification notes."}
                                      </div>
                                    </article>
                                  ))
                                ) : (
                                  <div className="muted">
                                    Generate this dossier to collect and verify source material.
                                  </div>
                                )}
                              </div>
                            </details>

                            <details className="dossier-packet">
                              <summary>Open Gaps</summary>
                              <div className="dossier-packet-body">
                                {entry.dossier.gaps.length > 0 ? (
                                  <ul className="clean-list">
                                    {entry.dossier.gaps.map((gap, index) => (
                                      <li key={`${entry.chapter.chapterKey}-gap-${index}`}>{gap}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <div className="muted">No open gaps are currently flagged.</div>
                                )}
                              </div>
                            </details>
                                </>
                              );
                            })()}
                        </>
                      ) : (
                          <div className="empty-state" style={{ padding: 0 }}>
                            No dossier has been generated for this chapter set yet. Use
                            the button above to run web research and verification.
                          </div>
                        )}
                      </section>
                    ))
                  ) : (
                    <div className="empty-state" style={{ padding: 0 }}>
                      Commit the outline first so the binder knows which chapters need
                      dossiers.
                    </div>
                  )}

                  {workspace.progress.failedChapters.length > 0 ? (
                    <details className="dossier-packet">
                      <summary>Research Generation Issues</summary>
                      <div className="dossier-packet-body">
                        <ul className="clean-list">
                          {workspace.progress.failedChapters.map((failure, index) => (
                            <li key={`${String(failure)}-${index}`}>
                              {typeof failure === "object" && failure && "chapterKey" in failure
                                ? `${findChapterLabel(workspace.availableChapters, String(failure.chapterKey))}: ${"message" in failure ? String(failure.message) : "Unknown error"}`
                                : String(failure)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 0 }}>
                  No binder tabs exist yet. Add one from the right rail.
                </div>
              )}
            </article>
          </section>
        </section>
      </main>
  );
}

const holdBannerStyle: React.CSSProperties = {
  background: "var(--rust-lit)",
  border: "1px solid rgba(165,70,47,0.4)",
  borderLeft: "4px solid var(--rust)",
  borderRadius: 8,
  padding: "14px 18px",
};
