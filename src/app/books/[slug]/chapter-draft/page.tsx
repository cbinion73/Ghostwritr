import Link from "next/link";

import {
  commitSelectedChapterDraft,
  runFullChapterDraftStage,
  runSelectedChapterDraft,
} from "./actions";
import { ResearchAutoRefresh } from "../research/auto-refresh";

import { STAGE_LINKS } from "@/lib/navigation";
import { getChapterDraftWorkspace } from "@/lib/workflows/chapter-draft";

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

  return (
    <div className="page-shell">
      <ResearchAutoRefresh active={isAutoRefreshing} />
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Chapter-by-chapter ghostwriting workspace that synthesizes outline,
            research, external stories, personal stories, and base story.
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
          {STAGE_LINKS.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href(slug)}
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
              The author agent drafts each chapter. The reviewer agent critiques it for
              craft, clarity, and AI tells before the draft lands here for your review.
              The normal flow is one chapter at a time.
            </div>
            {workspace.blockingReason ? (
              <div className="muted" style={{ marginTop: 10 }}>
                Blocked: {workspace.blockingReason}
              </div>
            ) : null}
          </div>

          <div className="button-row">
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
                          Commit Chapter
                        </button>
                      </form>
                    ) : null}
                  </>
                ) : null}
                <form action={runFullChapterDraftStage.bind(null, slug)}>
                  <button className="btn" type="submit">
                    Generate All Chapters
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
                  </div>
                </Link>
              ))}
              {workspace.entries.length === 0 ? (
                <div className="empty-state">
                  Commit the Promise and the paragraph-level Outline first. Then wait
                  for Base Story, Research, and External Stories to populate real chapter
                  inputs before this stage synthesizes the manuscript.
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
                        Commit Chapter
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
                <strong>Base Story Thread</strong>
                <div className="muted" style={{ lineHeight: 1.7 }}>
                  {selected.baseStoryChapter?.chapterStory ??
                    "No base story thread is available for this chapter yet."}
                </div>
              </div>
            </div>
          ) : (
            <div className="muted">Choose a chapter first.</div>
          )}
        </div>
      </aside>
    </div>
  );
}
