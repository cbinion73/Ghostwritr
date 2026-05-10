import Link from "next/link";

import { EditingExportMenu } from "../editing/export-menu";
import { refreshPublishingPackage } from "../editing/actions";
import { finalizePublishingHandoff } from "./actions";
import { PublishPackageExportButton } from "./package-export-button";
import { TypesetPackageButton } from "./typeset-package-button";

import { getBookStageLinks } from "@/lib/navigation";
import { getStaleDependencyRecoveryHint, getStaleDependencyState } from "@/lib/stale-dependency";
import { getEditingWorkspace } from "@/lib/workflows/editing";

function packageStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "prepared_needs_editorial_revision":
      return "Prepared, needs editorial revision";
    case "ready_to_publish":
      return "Ready to publish";
    default:
      return "Draft";
  }
}

function resolveEffectivePackageStatus(
  packageStatus: string | null | undefined,
  editorialRecommendation: string | null | undefined,
) {
  if (editorialRecommendation === "blocked") {
    return "prepared_needs_editorial_revision";
  }

  return packageStatus ?? "draft";
}

export default async function PublishStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getEditingWorkspace(slug);
  const stageLinks = getBookStageLinks(workspace.book.workflowType, slug);
  const staleDependency = getStaleDependencyState(workspace.stage?.metadataJson);
  const staleRecoveryHint = staleDependency
    ? getStaleDependencyRecoveryHint(workspace.stage?.stageKey)
    : null;
  const packageReady = Boolean(workspace.publishingPackage);
  const effectivePackageStatus = resolveEffectivePackageStatus(
    workspace.publishingPackage?.packageStatus,
    workspace.editorialReadinessGate.recommendation,
  );
  const publishWorkspaceStatus = !packageReady
    ? "WAITING ON EDITING"
    : effectivePackageStatus === "prepared_needs_editorial_revision"
      ? "EDITORIALLY BLOCKED"
      : "READY";

  return (
    <div className="page-shell">
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Final publishing workspace for export readiness, delivery formats, and handoff quality.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Publish: <strong>{publishWorkspaceStatus}</strong>
          </div>
        </div>

        <div className="stage-list">
          {stageLinks.map((stage) => (
            <Link key={stage.key} href={stage.href} className="stage-chip">
              {stage.label}
            </Link>
          ))}
          <Link href={`/books/${slug}/publish`} className="stage-chip active">
            Publish
          </Link>
        </div>
      </aside>

      <main className="main-column">
        <section className="glass-panel topbar">
          <div>
            <div className="label">Final Workspace</div>
            <h2>Publish</h2>
            <div className="muted">
              This is the final handoff surface for the manuscript package: export formats,
              packaging notes, and readiness to move from ghostwriting into publishing delivery.
            </div>
            {!packageReady ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Commit the Editing stage to generate the publishing package first.
              </div>
            ) : null}
            {staleDependency ? (
              <div className="muted" style={{ marginTop: 10 }}>
                <div>Stale: {staleDependency.reason}</div>
                <div style={{ marginTop: 6 }}>Recommended recovery: {staleRecoveryHint}</div>
              </div>
            ) : null}
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}/editing`}>
              Open Editing
            </Link>
            <form action={refreshPublishingPackage.bind(null, slug)}>
              <button className="btn" type="submit" disabled={!workspace.manuscriptAssembly}>
                Refresh Package
              </button>
            </form>
            <EditingExportMenu
              slug={slug}
              title={workspace.book.titleWorking ?? "manuscript"}
              disabled={!packageReady}
            />
            <PublishPackageExportButton
              slug={slug}
              title={workspace.book.titleWorking ?? "manuscript"}
              disabled={!packageReady}
            />
            <TypesetPackageButton
              slug={slug}
              title={workspace.book.titleWorking ?? "manuscript"}
              disabled={!packageReady}
            />
          </div>
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <div>
              <h3>Publish Readiness</h3>
              <div className="muted">
                A final operational readout before you hand the book to printing, ebook conversion,
                or a publishing partner.
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <strong>Publish Package Sync</strong>
            <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
              Status:{" "}
              {workspace.publishPackageSyncState.status === "synced"
                ? "Synced"
                : workspace.publishPackageSyncState.status === "stale"
                  ? "Refresh required"
                  : "Missing"}
              . {workspace.publishPackageSyncState.detail}
            </div>
            {workspace.publishPackageSyncState.lastRefreshedAt ? (
              <div className="muted" style={{ marginTop: 8 }}>
                Last refreshed {new Date(workspace.publishPackageSyncState.lastRefreshedAt).toLocaleString()}
              </div>
            ) : null}
          </div>

          <div className="manuscript-progress-grid">
            <div className="metric-card">
              <div className="label">Package status</div>
              <strong>{packageStatusLabel(effectivePackageStatus)}</strong>
            </div>
            <div className="metric-card">
              <div className="label">Total words</div>
              <strong>{workspace.publishingPackage?.totalWords.toLocaleString() ?? 0}</strong>
            </div>
            <div className="metric-card">
              <div className="label">Chapters</div>
              <strong>{workspace.publishingPackage?.chapterCount ?? workspace.totalChapters}</strong>
            </div>
            <div className="metric-card">
              <div className="label">Export formats</div>
              <strong>
                {workspace.publishingPackage?.exportFormats.length
                  ? workspace.publishingPackage.exportFormats.join(", ")
                  : "Waiting on package"}
              </strong>
            </div>
            <div className="metric-card">
              <div className="label">Draft quality</div>
              <strong>
                {workspace.draftQualityRollup
                  ? `${workspace.draftQualityRollup.averageScore}/100`
                  : "Awaiting scored draft"}
              </strong>
            </div>
          </div>
        </section>

        <section className="workspace-grid" style={{ marginTop: 24, gridTemplateColumns: "1.1fr 0.9fr" }}>
          <section className="glass-panel section-panel">
            <div className="section-header">
              <div>
                <h3>Publishing Package</h3>
                <div className="muted">
                  The latest prepared publishing package snapshot for the current manuscript assembly.
                </div>
              </div>
            </div>

            {workspace.publishingPackage ? (
              <div className="stack" style={{ padding: 0 }}>
                <div className="card">
                  <strong>{workspace.publishingPackage.title}</strong>
                  {workspace.publishingPackage.subtitle ? (
                    <div className="muted" style={{ marginTop: 8 }}>
                      {workspace.publishingPackage.subtitle}
                    </div>
                  ) : null}
                  <div className="pill-row" style={{ marginTop: 10 }}>
                    <div className="pill">
                      Prepared {new Date(workspace.publishingPackage.preparedAt).toLocaleString()}
                    </div>
                    <div className="pill">
                      Status: {packageStatusLabel(effectivePackageStatus)}
                    </div>
                  </div>
                  <ul className="clean-list" style={{ marginTop: 14 }}>
                    {workspace.publishingPackage.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                  <div className="pill-row" style={{ marginTop: 12 }}>
                    <div className="pill">Trim: {workspace.publishingPackage.trimSize}</div>
                    <div className="pill">
                      Target pages: {workspace.publishingPackage.targetPageCount ?? "Not set"}
                    </div>
                  </div>
                </div>

                <div className="card">
                  <strong>Final Delivery Checklist</strong>
                  <ul className="clean-list" style={{ marginTop: 10 }}>
                    <li>Manuscript assembled from the latest committed draft inputs.</li>
                    <li>Editorial revisions and current readiness state are reflected in the latest manuscript version.</li>
                    <li>Package includes the standard export set: DOCX, HTML, Markdown, and JSON.</li>
                    <li>Final print layout and front/back matter can proceed from this package.</li>
                  </ul>
                </div>

                <div className="card">
                  <strong>Editorial Gate</strong>
                  <ul className="clean-list" style={{ marginTop: 10 }}>
                    <li>Readiness score: {workspace.editorialReadinessGate.score}/100</li>
                    <li>Recommendation: {workspace.editorialReadinessGate.recommendation}</li>
                    <li>Next action: {workspace.editorialReadinessGate.nextActions[0] ?? "No additional action recorded."}</li>
                  </ul>
                </div>

                <div className="card">
                  <strong>Draft Quality Baseline</strong>
                  {workspace.draftQualityRollup ? (
                    <>
                      <ul className="clean-list" style={{ marginTop: 10 }}>
                        <li>Average score: {workspace.draftQualityRollup.averageScore}/100</li>
                        <li>Revision flags: {workspace.draftQualityRollup.chaptersNeedingRevision}</li>
                        <li>Strong / watch / needs attention: {workspace.draftQualityRollup.strongChapters} / {workspace.draftQualityRollup.watchChapters} / {workspace.draftQualityRollup.attentionChapters}</li>
                        <li>Weakest chapter: {workspace.draftQualityRollup.weakestChapterLabel ?? "None recorded"}</li>
                      </ul>
                      <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
                        {workspace.draftQualityRollup.headline}
                      </div>
                    </>
                  ) : (
                    <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
                      Draft quality telemetry has not been persisted for this manuscript yet. Refresh the underlying drafts to attach scored quality data to the final package.
                    </div>
                  )}
                </div>

                <div className="card">
                  <strong>Front Matter Plan</strong>
                  <ul className="clean-list" style={{ marginTop: 10 }}>
                    {workspace.publishingPackage.frontMatter.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="card">
                  <strong>Back Matter Plan</strong>
                  <ul className="clean-list" style={{ marginTop: 10 }}>
                    {workspace.publishingPackage.backMatter.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="card">
                  <strong>Typesetting Plan</strong>
                  <ul className="clean-list" style={{ marginTop: 10 }}>
                    <li>Trim profile: {workspace.publishingPackage.typesettingPlan.trimProfile}</li>
                    <li>Chapter openers: {workspace.publishingPackage.typesettingPlan.chapterOpenerStyle}</li>
                    <li>Running heads: {workspace.publishingPackage.typesettingPlan.runningHeads}</li>
                    <li>TOC included: {workspace.publishingPackage.typesettingPlan.tocIncluded ? "Yes" : "No"}</li>
                    <li>Widow / orphan control: {workspace.publishingPackage.typesettingPlan.widowOrphanControl ? "Enabled" : "Disabled"}</li>
                    <li>Section starts on recto: {workspace.publishingPackage.typesettingPlan.sectionStartsOnRecto ? "Yes" : "No"}</li>
                    <li>
                      Signature plan: {workspace.publishingPackage.typesettingPlan.estimatedSignatureCount} x{" "}
                      {workspace.publishingPackage.typesettingPlan.signaturePageMultiple}-page signatures with{" "}
                      {workspace.publishingPackage.typesettingPlan.estimatedBlankPages} blank page(s) reserved
                    </li>
                    <li>
                      Estimated total pages: {workspace.publishingPackage.typesettingPlan.estimatedTotalPages} (
                      {workspace.publishingPackage.typesettingPlan.estimatedFrontMatterPages} front /{" "}
                      {workspace.publishingPackage.typesettingPlan.estimatedBodyPages} body /{" "}
                      {workspace.publishingPackage.typesettingPlan.estimatedBackMatterPages} back)
                    </li>
                  </ul>
                  <ul className="clean-list" style={{ marginTop: 10 }}>
                    {workspace.publishingPackage.typesettingPlan.notes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div className="card">
                  <strong>Interior Layout Package</strong>
                  <ul className="clean-list" style={{ marginTop: 10 }}>
                    <li>Includes a print-oriented interior HTML file for final production refinement.</li>
                    <li>Includes a dedicated print stylesheet with page size, breaks, and chapter-opener rules.</li>
                    <li>Preserves front matter, back matter, TOC intent, and running-head guidance from the publishing package.</li>
                  </ul>
                </div>

                <div className="card">
                  <strong>Production Deliverables</strong>
                  <ul className="clean-list" style={{ marginTop: 10 }}>
                    <li>Layout manifest for interior pagination, recto starts, and signature planning.</li>
                    <li>Cover brief with spine-width estimate and cover-copy checklist.</li>
                    <li>Distribution manifest for downstream ebook, print, and retailer completion steps.</li>
                  </ul>
                </div>

                <div className="card">
                  <strong>Preflight Checks</strong>
                  <ul className="clean-list" style={{ marginTop: 10 }}>
                    {workspace.publishingPackage.preflightChecks.map((check) => (
                      <li key={check.name}>
                        {check.name}: {check.status} - {check.detail}
                      </li>
                    ))}
                  </ul>
                </div>

                {workspace.provenanceReport ? (
                  <div className="card">
                    <strong>Provenance Report</strong>
                    <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
                      Generated {new Date(workspace.provenanceReport.generatedAt).toLocaleString()}
                    </div>
                    <ul className="clean-list" style={{ marginTop: 10 }}>
                      {workspace.provenanceReport.artifactTrail.map((item) => (
                        <li key={`${item.stage}-${item.source}`}>
                          {item.stage}: {item.status} - {item.source}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {workspace.marketingHandoffPackage ? (
                  <div className="card">
                    <strong>Marketing Handoff</strong>
                    <div className="muted" style={{ marginTop: 10 }}>
                      {workspace.marketingHandoffPackage.synopsis}
                    </div>
                    <ul className="clean-list" style={{ marginTop: 10 }}>
                      {workspace.marketingHandoffPackage.hooks.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="empty-state">
                Publishing package not ready yet. Commit Editing after the manuscript assembly and
                revision pass are up to date.
              </div>
            )}
          </section>

          <section className="glass-panel section-panel">
            <div className="section-header">
              <div>
                <h3>Package History</h3>
                <div className="muted">
                  Track the final packaging snapshots over time.
                </div>
              </div>
            </div>

            {workspace.publishingHistory.length > 0 ? (
              <div className="idea-list">
                {workspace.publishingHistory.map((entry) => (
                  <article key={entry.id} className="idea-card">
                    <div className="chapter-list-header">
                      <strong>Package v{entry.versionNumber}</strong>
                      <span className={`binder-status status-${String(entry.lifecycleState).toLowerCase()}`}>
                        {entry.lifecycleState}
                      </span>
                    </div>
                    <div className="chapter-list-metrics" style={{ marginTop: 8 }}>
                      <span>{entry.chapterCount} chapters</span>
                      <span>{entry.totalWords.toLocaleString()} words</span>
                      <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="muted" style={{ marginTop: 10 }}>
                      {entry.summary}
                    </div>
                    <div className="pill-row" style={{ marginTop: 10 }}>
                      <div className="pill">Package: {packageStatusLabel(entry.packageStatus)}</div>
                      <div className="pill">Formats: {entry.exportFormats.join(", ")}</div>
                    </div>
                    <ul className="clean-list" style={{ marginTop: 10 }}>
                      {entry.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            ) : (
              <div className="muted">
                No package history yet. The first package snapshot appears after Editing is committed.
              </div>
            )}

            {workspace.publishingPackage ? (
              <div className="card" style={{ marginTop: 18 }}>
                <strong>Finalize Handoff</strong>
                <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
                  Mark this package as the final handoff snapshot once you are ready to treat the publish bundle as the current source of truth.
                </div>
                {workspace.finalHandoffState ? (
                  <div className="muted" style={{ marginTop: 10, lineHeight: 1.7 }}>
                    Finalized {new Date(workspace.finalHandoffState.finalizedAt).toLocaleString()}
                    {workspace.finalHandoffState.archivedAt
                      ? ` • Archive-ready ${new Date(workspace.finalHandoffState.archivedAt).toLocaleString()}`
                      : ""}
                  </div>
                ) : null}
                <form action={finalizePublishingHandoff.bind(null, slug)} className="stack" style={{ marginTop: 12, padding: 0 }}>
                  <label className="muted">
                    <input type="checkbox" name="archiveReady" defaultChecked={Boolean(workspace.finalHandoffState?.archivedAt)} /> Mark this handoff archive-ready too
                  </label>
                  <div className="button-row">
                    <button className="btn btn-primary" type="submit" disabled={!packageReady}>
                      {workspace.finalHandoffState ? "Refresh Final Handoff" : "Finalize Handoff"}
                    </button>
                    <Link className="btn" href={`/api/books/${slug}/archive`}>
                      Export Final Archive
                    </Link>
                  </div>
                </form>
                {workspace.finalHandoffState?.notes?.length ? (
                  <ul className="clean-list" style={{ marginTop: 10 }}>
                    {workspace.finalHandoffState.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            {workspace.publishingPackage ? (
              <div className="card" style={{ marginTop: 18 }}>
                <strong>Format Profiles</strong>
                <div className="idea-list" style={{ marginTop: 12 }}>
                  {workspace.publishingPackage.exportProfiles.map((profile) => (
                    <article key={profile.format} className="idea-card">
                      <div className="chapter-list-header">
                        <strong>{profile.format}</strong>
                        <span className="binder-status status-committed">{profile.status}</span>
                      </div>
                      <ul className="clean-list" style={{ marginTop: 10 }}>
                        {profile.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </section>
      </main>
    </div>
  );
}
