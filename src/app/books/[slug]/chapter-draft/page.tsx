import Link from "next/link";

import { AppTopBar } from "@/app/components/app-top-bar";
import {
  commitSelectedChapterDraft,
  expandSelectedChapterTowardTarget,
  expandUnderTargetChapters,
  repairWeakChapterDrafts,
  retryChapterDraftStage,
  runFullChapterDraftStage,
  runSelectedChapterDraft,
  stopChapterDraftStage,
} from "./actions";
import { StageRunPanel } from "@/app/components/stage-run-panel";

import { getBookStageLinks } from "@/lib/navigation";
import { getStaleDependencyRecoveryHint, getStaleDependencyState } from "@/lib/stale-dependency";
import { getChapterDraftWorkspace } from "@/lib/workflows/chapter-draft-public";

type QualitySignal = {
  label: string;
  state: "pass" | "warn" | "fail";
  detail: string;
};

type DraftQualitySummary = {
  score: number;
  readiness: "strong" | "watch" | "needs attention";
  signals: QualitySignal[];
  revisionPasses: number;
};

function chapterStatusLabel(status: string) {
  switch (status) {
    case "COMMITTED":
      return "Committed";
    case "DRAFT":
      return "Draft";
    default:
      return "Not generated";
  }
}

function approvalStatusLabel(
  approvalState: Awaited<ReturnType<typeof getChapterDraftWorkspace>>["selectedEntry"] extends infer T
    ? T extends { approvalState: infer A }
      ? A
      : never
    : never,
) {
  if (!approvalState) {
    return "Approval pending";
  }
  if (approvalState.isStale) {
    return "Approval stale";
  }
  switch (approvalState.status) {
    case "DRAFT_APPROVED":
      return "Draft approved";
    case "DRAFT_PENDING":
      return "Awaiting approval";
    case "FINAL_REVISION_PENDING":
      return "Final revision pending";
    case "FINAL_REVISION_APPROVED":
      return "Final approved";
    case "STALE":
      return "Approval stale";
    default:
      return "Approval pending";
  }
}

function shortVersionId(versionId: string | null | undefined) {
  return versionId ? versionId.slice(0, 8) : "none";
}

function chapterTargetStatusLabel(
  wordCount: number,
  minimumWords: number | null,
  maximumWords: number | null,
) {
  if (minimumWords == null || maximumWords == null) {
    return "No target";
  }
  if (wordCount < minimumWords) {
    return "Under target";
  }
  if (wordCount > maximumWords) {
    return "Over target";
  }
  return "On target";
}

function buildNonfictionDraftQuality(selected: Awaited<ReturnType<typeof getChapterDraftWorkspace>>["selectedEntry"]) {
  if (!selected?.draft) {
    return null;
  }

  if (selected.draft.quality && selected.draft.quality.signals.length > 0) {
    return {
      score: selected.draft.quality.score,
      readiness: selected.draft.quality.readiness,
      signals: selected.draft.quality.signals,
      revisionPasses: selected.draft.quality.revisionPasses,
    };
  }

  const sourceUsage = selected.draft.sourceUsage;
  const sourceCategoriesUsed = [
    sourceUsage.research.length > 0,
    sourceUsage.externalStories.length > 0,
    sourceUsage.personalStories.length > 0,
    sourceUsage.baseStory.length > 0,
  ].filter(Boolean).length;

  const renderedParagraphCount = selected.draft.chapterText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean).length;
  const sourceSignals: QualitySignal[] = [];

  const lengthState =
    selected.metrics.minimumWords == null || selected.metrics.maximumWords == null
      ? "warn"
      : selected.metrics.wordCount < selected.metrics.minimumWords ||
          selected.metrics.wordCount > selected.metrics.maximumWords
        ? "fail"
        : "pass";

  sourceSignals.push({
    label: "Length fit",
    state: lengthState,
    detail:
      selected.metrics.targetWords == null
        ? "No chapter target is locked yet."
        : `${selected.metrics.wordCount.toLocaleString()} words against a ${selected.metrics.minimumWords?.toLocaleString() ?? "?"}-${selected.metrics.maximumWords?.toLocaleString() ?? "?"} target band.`,
  });

  sourceSignals.push({
    label: "Source weave",
    state: sourceCategoriesUsed >= 3 ? "pass" : sourceCategoriesUsed >= 2 ? "warn" : "fail",
    detail:
      sourceCategoriesUsed >= 3
        ? "The draft is pulling from multiple upstream artifact types."
        : sourceCategoriesUsed >= 2
          ? "The draft is using some upstream inputs, but the weave still looks thin."
          : "The draft is leaning on too few upstream inputs and risks feeling assembled.",
  });

  sourceSignals.push({
    label: "Paragraph coverage",
    state:
      renderedParagraphCount >= selected.draft.paragraphs.length
        ? "pass"
        : renderedParagraphCount >= Math.max(1, selected.draft.paragraphs.length - 1)
          ? "warn"
          : "fail",
    detail: `${renderedParagraphCount} prose paragraphs are carrying ${selected.draft.paragraphs.length} planned paragraph anchors.`,
  });

  sourceSignals.push({
    label: "Editorial review",
    state:
      selected.review?.verdict === "ready_for_review"
        ? "pass"
        : selected.review?.verdict === "needs_revision"
          ? "warn"
          : "warn",
    detail:
      selected.review == null
        ? "No reviewer pass has been saved yet."
        : selected.review.aiAuthorshipFlags.length > 0
          ? `${selected.review.aiAuthorshipFlags.length} AI-authorship flags still need attention.`
          : selected.review.overallAssessment,
  });

  const score = Math.max(
    0,
    100 -
      sourceSignals.reduce(
        (sum, signal) => sum + (signal.state === "fail" ? 24 : signal.state === "warn" ? 10 : 0),
        0,
      ),
  );

  const readiness = score >= 85 ? "strong" : score >= 65 ? "watch" : "needs attention";

  return {
    score,
    readiness: readiness as DraftQualitySummary["readiness"],
    signals: sourceSignals,
    revisionPasses: 0,
  };
}

function buildNonfictionUpgradePlan(args: {
  draftQuality: DraftQualitySummary | null;
  review: Awaited<ReturnType<typeof getChapterDraftWorkspace>>["selectedEntry"] extends infer T
    ? T extends { review: infer R }
      ? R
      : never
    : never;
  sourceAvailability: Awaited<ReturnType<typeof getChapterDraftWorkspace>>["selectedEntry"] extends infer T
    ? T extends { sourceAvailability: infer S }
      ? S
      : never
    : never;
}) {
  const priorities = new Set<string>();

  for (const signal of args.draftQuality?.signals ?? []) {
    if (signal.state !== "pass") {
      priorities.add(`${signal.label}: ${signal.detail}`);
    }
  }

  for (const item of args.review?.revisionPriorities ?? []) {
    priorities.add(item);
  }

  if ((args.sourceAvailability?.researchCount ?? 0) === 0) {
    priorities.add("Research evidence is thin here. Pull in more concrete claims or examples before the next regenerate pass.");
  }
  if ((args.sourceAvailability?.personalStoryCount ?? 0) === 0) {
    priorities.add("The chapter still lacks lived-in personal material. Weave in a more specific human moment so the prose feels authored instead of assembled.");
  }
  if ((args.sourceAvailability?.externalStoryCount ?? 0) === 0) {
    priorities.add("External proof points are missing. Add one outside story or case to widen the chapter's authority and texture.");
  }

  return Array.from(priorities).slice(0, 5);
}

export default async function ChapterDraftStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ chapterKey?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const workspace = await getChapterDraftWorkspace(slug, query.chapterKey);
  const selected = workspace.selectedEntry;
  const isAutoRefreshing =
    workspace.progress.automationStatus === "queued" ||
    workspace.progress.automationStatus === "running";
  const chapterProgressPercent = workspace.progress.chapterCompletionPercent;
  const wordProgressPercent = workspace.progress.wordCompletionPercent;
  const selectedIndex = selected
    ? workspace.entries.findIndex((entry) => entry.chapterKey === selected.chapterKey)
    : -1;
  const previousEntry = selectedIndex > 0 ? workspace.entries[selectedIndex - 1] : null;
  const nextEntry =
    selectedIndex >= 0 && selectedIndex < workspace.entries.length - 1
      ? workspace.entries[selectedIndex + 1]
      : null;
  const hasSelectedDraft = Boolean(selected?.draft);
  const selectedUnderTarget =
    Boolean(selected?.draft) &&
    selected.metrics.minimumWords != null &&
    selected.metrics.wordCount < selected.metrics.minimumWords;
  const staleDependency = getStaleDependencyState(workspace.stage?.metadataJson);
  const draftQuality = buildNonfictionDraftQuality(selected);
  const upgradePlan = selected
    ? buildNonfictionUpgradePlan({
        draftQuality,
        review: selected.review ?? null,
        sourceAvailability: selected.sourceAvailability,
      })
    : [];
  const weakChapterCount = workspace.entries.filter(
    (entry) =>
      entry.draft &&
      entry.draft.chapterText.trim().length > 0 &&
      (
        !entry.draft.quality ||
        entry.draft.quality.signals.length === 0 ||
        entry.draft.quality.needsRevision ||
        entry.review?.verdict === "needs_revision"
      ),
  ).length;
  const stageLinks = getBookStageLinks(workspace.book.workflowType, slug);

  return (
    <div className="dark-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppTopBar bookSlug={slug} bookTitle={workspace.book.titleWorking ?? undefined} activePage="studio" />
      <div className="page-shell" style={{ flex: 1 }}>
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Chapter-by-chapter ghostwriting workspace that synthesizes the committed
            promise, outline, base story, research, external stories, and personal stories.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Chapter Draft: <strong>{workspace.stage?.status ?? "NOT_STARTED"}</strong>
          </div>
        </div>

        <div className="stage-list">
          {stageLinks.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href}
              className={`stage-chip ${stage.key === "CHAPTER_DRAFT" ? "active" : ""}`}
            >
              {stage.label}
            </Link>
          ))}
        </div>
      </aside>

      <main className="main-column">
        <section className="glass-panel topbar">
          <div>
            <div className="label">Stage Workspace</div>
            <h2>Chapter Draft</h2>
            <div className="muted">
              The author agent drafts each chapter from the full upstream artifact stack.
              The reviewer agent critiques it for craft, clarity, and AI tells before the
              draft lands here for your review. The normal flow is one chapter at a time.
            </div>
            {workspace.blockingReason ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Blocked: {workspace.blockingReason}
              </div>
            ) : null}
            {staleDependency ? (
              <div className="muted" style={{ marginTop: 10 }}>
                <div>Stale: {staleDependency.reason}</div>
                <div style={{ marginTop: 6 }}>
                  Recommended recovery: {getStaleDependencyRecoveryHint(workspace.stage?.stageKey)}
                </div>
              </div>
            ) : null}
            {isAutoRefreshing ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Chapter drafting is running. Refresh manually to see the latest progress.
              </div>
            ) : null}
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}`}>← Book Studio</Link>
            <Link className="btn" href={`/books/${slug}/publish`}>
              Open Publish
            </Link>
            {!workspace.blockingReason ? (
              <>
                {selected ? (
                  <>
                    <form action={runSelectedChapterDraft.bind(null, slug)}>
                      <input type="hidden" name="chapterKey" value={selected.chapterKey} />
                      <button className="btn btn-primary" type="submit">
                        {hasSelectedDraft ? "Regenerate This Chapter" : "Generate This Chapter"}
                      </button>
                    </form>
                    {hasSelectedDraft ? (
                      <form action={commitSelectedChapterDraft.bind(null, slug)}>
                        <input type="hidden" name="chapterKey" value={selected.chapterKey} />
                        <button className="btn btn-primary" type="submit">
                          Approve Chapter Draft
                        </button>
                      </form>
                    ) : null}
                    {hasSelectedDraft ? (
                      <form action={expandSelectedChapterTowardTarget.bind(null, slug)}>
                        <input type="hidden" name="chapterKey" value={selected.chapterKey} />
                        <button className="btn" type="submit" disabled={!selectedUnderTarget}>
                          Expand Toward Target
                        </button>
                      </form>
                    ) : null}
                  </>
                ) : null}
                <StageRunPanel
                  stageLabel="Chapter Draft"
                  progressUrl={`/api/books/${slug}/chapter-draft/progress`}
                  generateAction={runFullChapterDraftStage.bind(null, slug)}
                  stopAction={stopChapterDraftStage.bind(null, slug)}
                  retryAction={retryChapterDraftStage.bind(null, slug)}
                  hasGenerated={workspace.entries.some((entry) => Boolean(entry.draft))}
                  canGenerate={!workspace.blockingReason}
                  initialStatus={workspace.stage?.status ?? "NOT_STARTED"}
                  chapterLabels={Object.fromEntries(
                    workspace.entries.map((entry) => [entry.chapterKey, entry.chapterLabel]),
                  )}
                  generateLabel="Generate All Chapters"
                  regenerateLabel="Regenerate All Chapters"
                />
                <form action={expandUnderTargetChapters.bind(null, slug)}>
                  <input type="hidden" name="limit" value="2" />
                  <button className="btn" type="submit">
                    Expand Under-Target Chapters
                  </button>
                </form>
                <form action={repairWeakChapterDrafts.bind(null, slug)}>
                  <input type="hidden" name="limit" value="3" />
                  <button className="btn" type="submit" disabled={weakChapterCount === 0}>
                    Repair Weak Chapters
                  </button>
                </form>
              </>
            ) : null}
          </div>

          {!workspace.blockingReason ? (
            <div className="muted" style={{ marginTop: 10 }}>
              Use <strong>Generate This Chapter</strong> to work chapter by chapter. After you review it,
              use <strong>Next Chapter</strong> to move forward. Use{" "}
              <strong>Generate All Chapters</strong> only when you want the full manuscript pipeline to run in the background.
              {selectedUnderTarget
                ? ` Use Expand Toward Target when the selected chapter is materially short on finished prose.`
                : ""}
              {weakChapterCount > 0
                ? ` ${weakChapterCount} drafted chapter${weakChapterCount === 1 ? "" : "s"} currently need repair.`
                : ""}
            </div>
          ) : null}
        </section>

        <section className="glass-panel section-panel manuscript-progress-panel">
          <div className="section-header">
            <div>
              <h3>Manuscript Progress</h3>
              <div className="muted">
                Counted from the actual saved draft text, not the target prompt.
              </div>
            </div>
          </div>

          <div className="manuscript-progress-grid">
            <div className="metric-card">
              <div className="label">Book Progress</div>
              <strong>
                {workspace.progress.completedChapters}/{workspace.progress.totalChapters} chapters
              </strong>
              <div className="stage-progress-bar" style={{ marginTop: 10 }}>
                <div
                  className="stage-progress-fill"
                  style={{ width: `${chapterProgressPercent}%` }}
                />
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                {chapterProgressPercent}% of chapters drafted
              </div>
            </div>

            <div className="metric-card">
              <div className="label">Words Written</div>
              <strong>{workspace.progress.wordsWritten.toLocaleString()}</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                Target {workspace.progress.targetWordCount?.toLocaleString() ?? "not set"}
              </div>
              <div className="stage-progress-bar" style={{ marginTop: 10 }}>
                <div
                  className="stage-progress-fill"
                  style={{ width: `${wordProgressPercent}%` }}
                />
              </div>
            </div>

            <div className="metric-card">
              <div className="label">Estimated Pages</div>
              <strong>{workspace.progress.pagesWritten.toLocaleString()}</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                Target {workspace.progress.targetPageCount?.toLocaleString() ?? "not set"}
              </div>
            </div>
          </div>
        </section>

        <section className="workspace-grid chapter-draft-grid">
          <section className="glass-panel section-panel chapter-list-panel">
            <div className="section-header">
              <h3>Chapters</h3>
              <div className="muted">
                Read the book one chapter at a time while the full manuscript is being
                built in the background.
              </div>
            </div>

            <div className="chapter-list">
              {workspace.entries.map((entry) => (
                <Link
                  key={entry.chapterKey}
                  href={`/books/${slug}/chapter-draft?chapterKey=${entry.chapterKey}`}
                  className={`chapter-list-item ${
                    selected?.chapterKey === entry.chapterKey ? "selected" : ""
                  }`}
                >
                  <div className="chapter-list-header">
                    <strong>{entry.chapterLabel}</strong>
                    <span className={`binder-status status-${String(entry.status).toLowerCase()}`}>
                      {chapterStatusLabel(entry.status)}
                    </span>
                  </div>
                  <div className="muted chapter-list-meta">{entry.sectionTitle}</div>
                  <div className="chapter-list-metrics">
                    <span>{entry.metrics.wordCount.toLocaleString()} words</span>
                    <span>{entry.metrics.pageCount.toLocaleString()} pages</span>
                  </div>
                  <div className="muted chapter-list-meta">
                    Target{" "}
                    {entry.metrics.targetWords != null
                      ? `${entry.metrics.targetWords.toLocaleString()} words`
                      : "not set"}
                    {entry.metrics.minimumWords != null && entry.metrics.maximumWords != null
                      ? ` (${entry.metrics.minimumWords.toLocaleString()}-${entry.metrics.maximumWords.toLocaleString()})`
                      : ""}
                  </div>
                  <div className="muted chapter-list-meta">
                    {chapterTargetStatusLabel(
                      entry.metrics.wordCount,
                      entry.metrics.minimumWords,
                      entry.metrics.maximumWords,
                    )}
                    {entry.metrics.deltaFromTarget != null
                      ? ` • ${
                          entry.metrics.deltaFromTarget === 0
                            ? "At target"
                            : `${Math.abs(entry.metrics.deltaFromTarget).toLocaleString()} words ${
                                entry.metrics.deltaFromTarget > 0 ? "over" : "under"
                              }`
                        }`
                      : ""}
                  </div>
                  <div className="pill-row" style={{ marginTop: 10 }}>
                    <div className="pill">{entry.sourceAvailability.researchCount} research</div>
                    <div className="pill">
                      {entry.sourceAvailability.externalStoryCount} external stories
                    </div>
                    <div className="pill">
                      {entry.sourceAvailability.personalStoryCount} personal stories
                    </div>
                    <div className="pill">
                      {entry.quillContextSummary.ready ? "Quill ready" : "Quill blocked"}
                    </div>
                    <div className="pill">{approvalStatusLabel(entry.approvalState)}</div>
                    <div className="pill">
                      {entry.review?.verdict === "ready_for_review"
                        ? "Review: ready"
                        : entry.review?.verdict === "needs_revision"
                          ? "Review: revise"
                          : "Review pending"}
                    </div>
                  </div>
                </Link>
              ))}
              {workspace.entries.length === 0 ? (
                <div className="empty-state">
                  Commit the Promise and the paragraph-level Outline first. Then wait
                  for committed Base Story, Research, External Stories, and Personal
                  Stories to populate real chapter inputs before this stage synthesizes the manuscript.
                </div>
              ) : null}
            </div>
          </section>

          <section className="glass-panel section-panel paper-wrap">
            <article className="paper manuscript-paper">
              <div className="toc-kicker">Manuscript</div>
              <h3>{selected?.chapterLabel ?? "Chapter Draft"}</h3>

              {selected && !workspace.blockingReason ? (
                <div className="button-row" style={{ marginBottom: 18 }}>
                  <form action={runSelectedChapterDraft.bind(null, slug)}>
                    <input type="hidden" name="chapterKey" value={selected.chapterKey} />
                    <button className="btn btn-primary" type="submit">
                      {hasSelectedDraft ? "Regenerate This Chapter" : "Generate This Chapter"}
                    </button>
                  </form>
                  {hasSelectedDraft ? (
                    <form action={commitSelectedChapterDraft.bind(null, slug)}>
                      <input type="hidden" name="chapterKey" value={selected.chapterKey} />
                      <button className="btn" type="submit">
                        Approve Chapter Draft
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : null}

              {selected ? (
                <div className="button-row" style={{ marginBottom: 18 }}>
                  {previousEntry ? (
                    <Link
                      className="btn"
                      href={`/books/${slug}/chapter-draft?chapterKey=${previousEntry.chapterKey}`}
                    >
                      Previous Chapter
                    </Link>
                  ) : null}
                  {nextEntry ? (
                    <Link
                      className="btn"
                      href={`/books/${slug}/chapter-draft?chapterKey=${nextEntry.chapterKey}`}
                    >
                      Next Chapter
                    </Link>
                  ) : null}
                </div>
              ) : null}

              <div className="research-stage-progress">
                <div className="metric">
                  Chapters completed: {workspace.progress.completedChapters}/
                  {workspace.progress.totalChapters}
                </div>
                <div className="metric">
                  Stage state: {workspace.progress.automationStatus.replace(/_/g, " ")}
                </div>
                {selected ? (
                  <>
                    <div className="metric">
                      Chapter words: {selected.metrics.wordCount.toLocaleString()}
                    </div>
                    <div className="metric">
                      Chapter pages: {selected.metrics.pageCount.toLocaleString()}
                    </div>
                    <div className="metric">
                      Chapter target:{" "}
                      {selected.metrics.targetWords?.toLocaleString() ?? "not set"}
                    </div>
                    <div className="metric">
                      Target band:{" "}
                      {selected.metrics.minimumWords != null &&
                      selected.metrics.maximumWords != null
                        ? `${selected.metrics.minimumWords.toLocaleString()}-${selected.metrics.maximumWords.toLocaleString()}`
                        : "not set"}
                    </div>
                    <div className="metric">
                      Length status:{" "}
                      {chapterTargetStatusLabel(
                        selected.metrics.wordCount,
                        selected.metrics.minimumWords,
                        selected.metrics.maximumWords,
                      )}
                    </div>
                    <div className="metric">
                      Generation mode:{" "}
                      {selected.draft
                        ? "This chapter has a draft. Regenerate only if you want a fresh version."
                        : "Generate this chapter first. Then move to the next chapter when you are ready."}
                    </div>
                    <div className="metric">
                      Approval state: {approvalStatusLabel(selected.approvalState)}
                    </div>
                    <div className="metric">
                      Pending draft version:{" "}
                      {shortVersionId(selected.approvalState?.draftPendingVersionId)}
                    </div>
                    <div className="metric">
                      Approved draft version:{" "}
                      {shortVersionId(selected.approvalState?.approvedDraftVersionId)}
                    </div>
                  </>
                ) : null}
              </div>

              {selected?.draft ? (
                <div className="manuscript-body">
                  <p className="manuscript-kicker">{selected.draft.openingHook}</p>
                  {selected.draft.chapterText.split("\n\n").map((paragraph, index) => (
                    <p key={`${selected.chapterKey}-paragraph-${index}`}>{paragraph}</p>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  No chapter draft yet. Once the upstream chapter dossiers contain real
                  source material, use <strong>Generate This Chapter</strong> to write only this chapter,
                  or <strong>Generate All Chapters</strong> to run the whole manuscript in the background.
                </div>
              )}
            </article>
          </section>
        </section>
      </main>

      <aside className="glass-panel rightbar">
        <div className="card">
          <div className="label">Author Approval</div>
          <h3 style={{ marginTop: 6 }}>Chapter Review</h3>
          {selected ? (
            <div className="stack" style={{ padding: 0 }}>
              <div className="recommendation">
                {approvalStatusLabel(selected.approvalState)}
              </div>
              <div className="muted">
                Pending version: {shortVersionId(selected.approvalState?.draftPendingVersionId)}
              </div>
              <div className="muted">
                Approved version: {shortVersionId(selected.approvalState?.approvedDraftVersionId)}
              </div>
              {selected.approvalState?.isStale ? (
                <div className="muted">
                  Stale reason: {selected.approvalState.staleReason ?? "Upstream chapter inputs changed."}
                </div>
              ) : null}
              {selected.draft ? (
                <div className="muted" style={{ lineHeight: 1.7 }}>
                  Read this chapter in the manuscript pane. If it is the version you want Quill to hand to Editing,
                  use <strong>Approve Chapter Draft</strong>. GHOSTWRITR stores the exact approved draft version ID.
                </div>
              ) : (
                <div className="muted">Generate this chapter before approving it.</div>
              )}
            </div>
          ) : (
            <div className="muted">Choose a chapter to approve one draft version at a time.</div>
          )}
        </div>

        <div className="card">
          <div className="label">Quality Signals</div>
          <h3 style={{ marginTop: 6 }}>Draft Quality</h3>
          {draftQuality ? (
            <div className="stack" style={{ padding: 0 }}>
              <div className="recommendation">
                Score {draftQuality.score}/100 • {draftQuality.readiness}
              </div>
              <div className="muted">Revision passes: {draftQuality.revisionPasses}</div>
              <ul className="clean-list">
                {draftQuality.signals.map((signal) => (
                  <li key={signal.label}>
                    <strong>{signal.label}</strong>: {signal.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="muted">
              Draft quality signals appear after a chapter has real prose to evaluate.
            </div>
          )}
        </div>

        <div className="card">
          <div className="label">Reviewer Feedback</div>
          <h3 style={{ marginTop: 6 }}>Editorial Notes</h3>
          {selected?.review ? (
            <div className="stack" style={{ padding: 0 }}>
              <div className="recommendation">{selected.review.overallAssessment}</div>
              <div>
                <strong>Strengths</strong>
                <ul className="clean-list">
                  {selected.review.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>Concerns</strong>
                <ul className="clean-list">
                  {selected.review.concerns.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <strong>AI Authorship Flags</strong>
                <ul className="clean-list">
                  {selected.review.aiAuthorshipFlags.length > 0 ? (
                    selected.review.aiAuthorshipFlags.map((item) => <li key={item}>{item}</li>)
                  ) : (
                    <li>No obvious flags were detected in the latest review pass.</li>
                  )}
                </ul>
              </div>
            </div>
          ) : (
            <div className="muted">Reviewer notes will appear after the chapter is drafted.</div>
          )}
        </div>

        <div className="card">
          <div className="label">Upgrade Plan</div>
          <h3 style={{ marginTop: 6 }}>Next Best Moves</h3>
          {selected ? (
            upgradePlan.length > 0 ? (
              <ul className="clean-list">
                {upgradePlan.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <div className="muted">
                This chapter is in a healthy place. The next best move is usually to commit it and advance to the next chapter.
              </div>
            )
          ) : (
            <div className="muted">Choose a chapter to see the highest-leverage rewrite priorities.</div>
          )}
        </div>

        <div className="card">
          <div className="label">Quill Context</div>
          <h3 style={{ marginTop: 6 }}>Approved Inputs</h3>
          {selected ? (
            <div className="stack" style={{ padding: 0 }}>
              <div className="recommendation">
                {selected.quillContextSummary.ready
                  ? "Quill is ready to draft this chapter from approved, chapter-scoped context."
                  : "Quill is blocked until this chapter context is cleaned up."}
              </div>
              {selected.quillContextSummary.issues.length > 0 ? (
                <ul className="clean-list">
                  {selected.quillContextSummary.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}

              <div>
                <strong>Approved brief</strong>
                <div className="muted" style={{ lineHeight: 1.7 }}>
                  {selected.quillContextSummary.approvedBrief.present
                    ? selected.quillContextSummary.approvedBrief.summary
                    : "No approved Phase 1 strategic brief is available."}
                </div>
              </div>

              <div>
                <strong>Current paragraph outline</strong>
                <div className="muted" style={{ marginTop: 4 }}>
                  {selected.quillContextSummary.paragraphOutline.paragraphCount} paragraph anchors
                </div>
                <ul className="clean-list">
                  {selected.quillContextSummary.paragraphOutline.anchors.map((paragraph) => (
                    <li key={paragraph.id}>
                      {paragraph.topicSentence}
                      <span className="muted"> — {paragraph.purpose}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <strong>Base Story guidance</strong>
                <div className="muted" style={{ lineHeight: 1.7 }}>
                  {selected.quillContextSummary.baseStoryGuidance.present
                    ? selected.quillContextSummary.baseStoryGuidance.draftingInstruction
                    : "No chapter Base Story guidance is available."}
                </div>
              </div>

              <div>
                <strong>Verified chapter sources</strong>
                <div className="muted" style={{ marginTop: 4 }}>
                  {selected.quillContextSummary.evidence.researchCount} research records ·{" "}
                  {selected.quillContextSummary.evidence.externalStoryCount} external stories
                </div>
                <ul className="clean-list">
                  {[
                    ...selected.quillContextSummary.evidence.researchTitles,
                    ...selected.quillContextSummary.evidence.externalStoryTitles,
                  ].slice(0, 6).map((title) => (
                    <li key={title}>{title}</li>
                  ))}
                </ul>
              </div>

              <div>
                <strong>Assigned personal stories</strong>
                <div className="muted" style={{ marginTop: 4 }}>
                  {selected.quillContextSummary.personalStories.count} permissioned story card
                  {selected.quillContextSummary.personalStories.count === 1 ? "" : "s"}
                </div>
                {selected.quillContextSummary.personalStories.titles.length > 0 ? (
                  <ul className="clean-list">
                    {selected.quillContextSummary.personalStories.titles.map((title) => (
                      <li key={title}>{title}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div>
                <strong>Voice and craft</strong>
                <div className="muted" style={{ marginTop: 4 }}>
                  Dominant voice: {selected.quillContextSummary.voiceGuide.dominantPersona ?? "not set"} ·{" "}
                  {selected.quillContextSummary.craftNotes.count} craft notes
                </div>
                <ul className="clean-list">
                  {[
                    ...selected.quillContextSummary.voiceGuide.guidance,
                    ...selected.quillContextSummary.craftNotes.notes,
                  ].slice(0, 6).map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="muted">Choose a chapter to see the exact approved packet Quill will use.</div>
          )}
        </div>

        <div className="card">
          <div className="label">Input Mix</div>
          <h3 style={{ marginTop: 6 }}>Source Context</h3>
          {selected ? (
            <div className="stack" style={{ padding: 0 }}>
              <div>
                <strong>Research</strong>
                <ul className="clean-list">
                  {selected.research?.factBank.slice(0, 3).map((item) => (
                    <li key={item.id}>{item.claimText}</li>
                  )) ?? <li>No research dossier is available yet.</li>}
                </ul>
              </div>

              <div>
                <strong>External Stories</strong>
                <ul className="clean-list">
                  {selected.externalStories?.storyCandidates.slice(0, 3).map((story) => (
                    <li key={story.id}>{story.title}</li>
                  )) ?? <li>No external stories are available yet.</li>}
                </ul>
              </div>

              <div>
                <strong>Personal Stories</strong>
                <ul className="clean-list">
                  {selected.personalStories.length > 0 ? (
                    selected.personalStories.map((story) => <li key={story.id}>{story.title}</li>)
                  ) : (
                    <li>No relevant personal stories are matched yet.</li>
                  )}
                </ul>
              </div>

              <div>
                <strong>Base Story Guidance</strong>
                <div className="muted" style={{ lineHeight: 1.7 }}>
                  {selected.baseStoryChapter?.guidance.draftingInstruction ??
                    "No base story guidance is available for this chapter yet."}
                </div>
              </div>
            </div>
          ) : (
            <div className="muted">Choose a chapter first.</div>
          )}
        </div>
      </aside>
      </div>
    </div>
  );
}
