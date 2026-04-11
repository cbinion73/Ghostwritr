import Link from "next/link";
import { ArtifactType, StageKey } from "@prisma/client";

import { DashboardAutoRefresh } from "./auto-refresh";
import {
  resumeFailedDashboardStage,
  retryDashboardStage,
  stopDashboardStage,
} from "./actions";
import { SubmitButton } from "@/app/components/submit-button";

import { getOrCreateBookBySlug } from "@/lib/repositories/books";
import { getCommittedBookSetup } from "@/lib/repositories/book-setup-artifacts";
import { getChapterArtifactVersions } from "@/lib/repositories/chapter-draft-artifacts";
import { STAGE_LINKS } from "@/lib/navigation";
import { getCommittedOutline } from "@/lib/repositories/outline-artifacts";
import {
  getResearchItemsForVersion,
  getResearchPackVersions,
  getResearchSourcesForVersion,
} from "@/lib/repositories/research-artifacts";
import {
  getExternalStoriesForVersion,
  getExternalStoryPackVersions,
  getExternalStorySourcesForVersion,
} from "@/lib/repositories/external-stories-artifacts";
import { getBaseStoryVersions } from "@/lib/repositories/base-story-artifacts";
import type { BookOutline } from "@/lib/outline-types";
import type { BaseStoryBundle } from "@/lib/base-story-types";
import type { BookSetupProfile } from "@/lib/book-setup-types";
import type { ChapterDraftBundle } from "@/lib/chapter-draft-types";
import { countWords, estimatePagesFromWords, toPercent } from "@/lib/manuscript-metrics";

function parseMetadata(value: unknown) {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }

  return {};
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  return fallback;
}

function getProgress(stage: {
  status: string;
  metadataJson: unknown;
}) {
  const metadata = parseMetadata(stage.metadataJson);
  const failedChapters = Array.isArray(metadata.failedChapters) ? metadata.failedChapters : [];
  const total =
    typeof metadata.totalChapters === "number" && metadata.totalChapters > 0
      ? metadata.totalChapters
      : stage.status === "READY_FOR_REVIEW" || stage.status === "COMMITTED"
        ? 1
        : 0;
  const rawCompleted =
    typeof metadata.completedChapters === "number" && metadata.completedChapters >= 0
      ? metadata.completedChapters
      : stage.status === "READY_FOR_REVIEW" || stage.status === "COMMITTED"
        ? total || 1
        : 0;
  const completed =
    (stage.status === "READY_FOR_REVIEW" || stage.status === "COMMITTED") &&
    failedChapters.length === 0
      ? total || rawCompleted
      : rawCompleted;
  const percent =
    total > 0
      ? Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
      : stage.status === "READY_FOR_REVIEW" || stage.status === "COMMITTED"
        ? 100
        : 0;

  return {
    total,
    completed,
    percent,
    automationStatus:
      typeof metadata.automationStatus === "string" ? metadata.automationStatus : "not_started",
    currentAction:
      typeof metadata.currentAction === "string" ? metadata.currentAction : null,
    currentChapterKey:
      typeof metadata.currentChapterKey === "string" ? metadata.currentChapterKey : null,
    failedChapters,
    provisionalChapters: Array.isArray(metadata.provisionalChapters)
      ? metadata.provisionalChapters
      : [],
    recentActivity: Array.isArray(metadata.recentActivity) ? metadata.recentActivity : [],
    selectedFormat:
      typeof metadata.selectedFormat === "string" ? metadata.selectedFormat : null,
  };
}

function buildChapterLabelMap(outline: BookOutline | null) {
  return new Map(
    (outline?.sections ?? []).flatMap((section) =>
      section.chapters.map((chapter) => [chapter.id, `Chapter ${chapter.number}: ${chapter.title}`]),
    ),
  );
}

type ManuscriptRangeStatus = "NO_TARGET" | "UNDER" | "WITHIN" | "OVER";

async function getManuscriptMetrics(bookId: string, outline: BookOutline | null) {
  const bookSetupVersion = await getCommittedBookSetup(bookId);
  const bookSetup = parseJson<BookSetupProfile | null>(bookSetupVersion?.contentJson, null);
  const chapterRefs =
    outline?.sections.flatMap((section) => section.chapters.map((chapter) => chapter)) ?? [];

  const chapterMetrics = await Promise.all(
    chapterRefs.map(async (chapter) => {
      const draftVersion = (
        await getChapterArtifactVersions(bookId, chapter.id, ArtifactType.CHAPTER_DRAFT, 1)
      )[0];
      const draft = draftVersion
        ? parseJson<ChapterDraftBundle | null>(draftVersion.contentJson, null)
        : null;
      const wordCount = countWords(draft?.chapterText);
      const pageCount = estimatePagesFromWords(wordCount, bookSetup?.trimSize ?? "6 x 9 in");

      return {
        chapterKey: chapter.id,
        wordCount,
        pageCount,
      };
    }),
  );

  const wordsWritten = chapterMetrics.reduce((sum, entry) => sum + entry.wordCount, 0);
  const pagesWritten = chapterMetrics.reduce((sum, entry) => sum + entry.pageCount, 0);
  const draftedChapters = chapterMetrics.filter((entry) => entry.wordCount > 0).length;
  const targetWordCount = bookSetup?.targetWordCount ?? null;
  const targetPageCount =
    bookSetup?.targetPageCount ??
    (targetWordCount
      ? estimatePagesFromWords(targetWordCount, bookSetup?.trimSize ?? "6 x 9 in")
      : null);
  const wordCountTolerance = bookSetup?.wordCountTolerance ?? 0;
  const minimumWordCount = targetWordCount ? Math.max(0, targetWordCount - wordCountTolerance) : null;
  const maximumWordCount = targetWordCount ? targetWordCount + wordCountTolerance : null;
  const rangeStatus: ManuscriptRangeStatus =
    targetWordCount == null
      ? "NO_TARGET"
      : wordsWritten < (minimumWordCount ?? 0)
        ? "UNDER"
        : wordsWritten > (maximumWordCount ?? Number.MAX_SAFE_INTEGER)
          ? "OVER"
          : "WITHIN";

  return {
    wordsWritten,
    pagesWritten,
    draftedChapters,
    totalChapters: chapterRefs.length,
    targetWordCount,
    targetPageCount,
    wordCountTolerance,
    minimumWordCount,
    maximumWordCount,
    rangeStatus,
    chapterProgressPercent: toPercent(draftedChapters, chapterRefs.length),
    wordProgressPercent: targetWordCount ? toPercent(wordsWritten, targetWordCount) : 0,
  };
}

function findStage(book: Awaited<ReturnType<typeof getOrCreateBookBySlug>>, stageKey: StageKey) {
  return book.stages.find((stage) => stage.stageKey === stageKey) ?? null;
}

function dialStyle(percent: number, stageStatus?: string, automationStatus?: string) {
  const color =
    automationStatus === "running"
      ? "#4f7f98"
      : automationStatus === "queued"
        ? "#7c8fa6"
        : automationStatus === "blocked" || stageStatus === "BLOCKED"
          ? "#b06733"
          : automationStatus === "ready_for_review" || stageStatus === "READY_FOR_REVIEW"
            ? "#5e8a4a"
            : automationStatus === "canceled"
              ? "#7c786f"
              : "#b67b36";

  return {
    background: `conic-gradient(${color} 0 ${percent}%, rgba(91, 68, 43, 0.14) ${percent}% 100%)`,
  };
}

function rangeStatusLabel(status: "NO_TARGET" | "UNDER" | "WITHIN" | "OVER") {
  switch (status) {
    case "UNDER":
      return "Under target range";
    case "WITHIN":
      return "Within target range";
    case "OVER":
      return "Over target range";
    default:
      return "No target range set";
  }
}

function getFailedChapterKeys(metadata: unknown) {
  const record = parseMetadata(metadata);
  if (!Array.isArray(record.failedChapters)) {
    return new Set<string>();
  }

  return new Set(
    record.failedChapters
      .map((entry) => {
        if (entry && typeof entry === "object" && "chapterKey" in entry) {
          const chapterKey = entry.chapterKey;
          return typeof chapterKey === "string" ? chapterKey : null;
        }

        return null;
      })
      .filter((value): value is string => Boolean(value)),
  );
}

function getProvisionalChapterKeys(metadata: unknown) {
  const record = parseMetadata(metadata);
  if (!Array.isArray(record.provisionalChapters)) {
    return new Set<string>();
  }

  return new Set(
    record.provisionalChapters.filter(
      (entry): entry is string => typeof entry === "string",
    ),
  );
}

async function buildQualityReport(bookId: string, input?: {
  researchStage?: { metadataJson: unknown } | null;
  externalStoriesStage?: { metadataJson: unknown } | null;
}) {
  const outlineVersion = await getCommittedOutline(bookId);
  const outline = parseJson<BookOutline | null>(outlineVersion?.contentJson, null);
  const chapterKeys =
    outline?.sections.flatMap((section) =>
      section.chapters.map((chapter) => ({
        chapterKey: chapter.id,
        chapterLabel: `Chapter ${chapter.number}: ${chapter.title}`,
      })),
    ) ?? [];

  const issues: string[] = [];
  let researchReadyCount = 0;
  let externalStoriesReadyCount = 0;
  const failedResearchChapters = getFailedChapterKeys(input?.researchStage?.metadataJson);
  const provisionalResearchChapters = getProvisionalChapterKeys(
    input?.researchStage?.metadataJson,
  );
  const failedExternalStoryChapters = getFailedChapterKeys(
    input?.externalStoriesStage?.metadataJson,
  );
  const provisionalExternalStoryChapters = getProvisionalChapterKeys(
    input?.externalStoriesStage?.metadataJson,
  );

  for (const chapter of chapterKeys) {
    if (failedResearchChapters.has(chapter.chapterKey)) {
      issues.push(`${chapter.chapterLabel} is still marked failed in Research.`);
    } else if (provisionalResearchChapters.has(chapter.chapterKey)) {
      issues.push(`${chapter.chapterLabel} is still provisional in Research.`);
    } else {
      const researchVersion = (await getResearchPackVersions(bookId, chapter.chapterKey, 1))[0];
      if (!researchVersion) {
        issues.push(`${chapter.chapterLabel} has no research dossier yet.`);
      } else {
        const [researchSources, researchItems] = await Promise.all([
          getResearchSourcesForVersion(researchVersion.id),
          getResearchItemsForVersion(researchVersion.id),
        ]);
        const verifiedSources = researchSources.filter((source) => source.isVerified).length;
        const verifiedItems = researchItems.filter(
          (item) => item.verificationStatus === "VERIFIED",
        ).length;

        if (verifiedSources < 2) {
          issues.push(`${chapter.chapterLabel} needs more verified research sources.`);
        } else if (verifiedItems < 3) {
          issues.push(`${chapter.chapterLabel} needs more admitted research items.`);
        } else {
          researchReadyCount += 1;
        }
      }
    }

    if (failedExternalStoryChapters.has(chapter.chapterKey)) {
      issues.push(`${chapter.chapterLabel} is still marked failed in External Stories.`);
      continue;
    }

    if (provisionalExternalStoryChapters.has(chapter.chapterKey)) {
      issues.push(`${chapter.chapterLabel} is still provisional in External Stories.`);
      continue;
    }

    const storyVersion = (await getExternalStoryPackVersions(bookId, chapter.chapterKey, 1))[0];
    if (!storyVersion) {
      issues.push(`${chapter.chapterLabel} has no external story vault yet.`);
    } else {
      const [storySources, stories] = await Promise.all([
        getExternalStorySourcesForVersion(storyVersion.id),
        getExternalStoriesForVersion(storyVersion.id),
      ]);
      const verifiedStories = stories.filter(
        (story) => story.verificationStatus === "VERIFIED",
      ).length;

      if (storySources.length < 2) {
        issues.push(`${chapter.chapterLabel} needs more external story sources.`);
      } else if (verifiedStories < 3) {
        issues.push(`${chapter.chapterLabel} needs more verified external stories.`);
      } else {
        externalStoriesReadyCount += 1;
      }
    }
  }

  const baseStoryVersion = (await getBaseStoryVersions(bookId, 1))[0] ?? null;
  const baseStory = parseJson<BaseStoryBundle | null>(baseStoryVersion?.contentJson, null);
  const baseStoryMatchesOutline =
    baseStory?.chapters.length === chapterKeys.length && chapterKeys.length > 0;

  if (!baseStoryVersion) {
    issues.push("Base Story has not generated yet.");
  } else if (!baseStoryMatchesOutline) {
    issues.push("Base Story does not yet cover every chapter in the committed outline.");
  }

  const totalChecks = Math.max(1, chapterKeys.length * 2 + 1);
  const passedChecks =
    researchReadyCount + externalStoriesReadyCount + (baseStoryMatchesOutline ? 1 : 0);
  const percent = Math.round((passedChecks / totalChecks) * 100);

  return {
    totalChapters: chapterKeys.length,
    researchReadyCount,
    externalStoriesReadyCount,
    baseStoryReady: baseStoryMatchesOutline,
    issues,
    percent,
    status:
      issues.length === 0
        ? "PASS"
        : passedChecks > 0
          ? "ATTENTION"
          : "BLOCKED",
  };
}

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const book = await getOrCreateBookBySlug(slug);
  const outlineVersion = await getCommittedOutline(book.id);
  const outline = parseJson<BookOutline | null>(outlineVersion?.contentJson, null);
  const chapterLabelMap = buildChapterLabelMap(outline);
  const manuscriptMetrics = await getManuscriptMetrics(book.id, outline);
  const researchStage = findStage(book, StageKey.RESEARCH);
  const externalStoriesStage = findStage(book, StageKey.EXTERNAL_STORIES);
  const baseStoryStage = findStage(book, StageKey.BASE_STORY);
  const chapterDraftStage = findStage(book, StageKey.CHAPTER_DRAFT);

  const cards = [
    {
      key: "research",
      label: "Research",
      href: `/books/${slug}/research`,
      stage: researchStage,
    },
    {
      key: "external-stories",
      label: "External Stories",
      href: `/books/${slug}/external-stories`,
      stage: externalStoriesStage,
    },
    {
      key: "base-story",
      label: "Base Story",
      href: `/books/${slug}/base-story`,
      stage: baseStoryStage,
    },
    {
      key: "chapter-draft",
      label: "Chapter Draft",
      href: `/books/${slug}/chapter-draft`,
      stage: chapterDraftStage,
    },
  ].map((card) => {
    const progress = getProgress(
      card.stage ?? {
        status: "NOT_STARTED",
        metadataJson: {},
      },
    );

    const currentChapterLabel =
      chapterLabelMap.get(progress.currentChapterKey ?? "") ??
      progress.currentChapterKey ??
      (progress.automationStatus === "running" ? "Working" : "Waiting");

    const latestFailure =
      progress.failedChapters.length > 0 &&
      progress.failedChapters[progress.failedChapters.length - 1] &&
      typeof progress.failedChapters[progress.failedChapters.length - 1] === "object"
        ? (progress.failedChapters[progress.failedChapters.length - 1] as {
            chapterKey?: string;
            message?: string;
          })
        : null;

    return {
      ...card,
      progress,
      currentChapterLabel,
      issueSummary:
        latestFailure?.message?.split(". ")[0] ??
        (progress.provisionalChapters.length > 0
          ? `${progress.provisionalChapters.length} provisional chapter${progress.provisionalChapters.length === 1 ? "" : "s"} need web upgrade`
          : null) ??
        (progress.automationStatus === "running"
          ? "Running normally"
          : progress.automationStatus === "queued"
            ? "Waiting for worker"
            : progress.automationStatus === "ready_for_review"
              ? "No blocking issues"
              : null),
    };
  });

  const autoRefresh = cards.some((card) =>
    ["queued", "running"].includes(card.progress.automationStatus),
  );
  const quality = await buildQualityReport(book.id, {
    researchStage,
    externalStoriesStage,
  });
  const liveFeed = cards
    .flatMap((card) => {
      const entries = [];
      if (card.progress.currentAction) {
        entries.push({
          key: `${card.key}-current`,
          at:
            (card.progress.recentActivity[0] &&
            typeof card.progress.recentActivity[0] === "object" &&
            "at" in card.progress.recentActivity[0] &&
            typeof card.progress.recentActivity[0].at === "string"
              ? card.progress.recentActivity[0].at
              : null) ?? new Date(0).toISOString(),
          stageLabel: card.label,
          message: card.progress.currentAction,
          detail: card.currentChapterLabel,
          emphasis:
            card.progress.automationStatus === "running" ||
            card.progress.automationStatus === "queued",
        });
      }

      for (const [index, entry] of card.progress.recentActivity.entries()) {
        const item =
          entry && typeof entry === "object"
            ? (entry as { at?: string; message?: string })
            : null;
        if (!item?.message) {
          continue;
        }

        entries.push({
          key: `${card.key}-activity-${index}`,
          at: item.at ?? new Date(0).toISOString(),
          stageLabel: card.label,
          message: item.message,
          detail: card.currentChapterLabel,
          emphasis: index === 0,
        });
      }

      return entries;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 12);
  const activeCards = cards.filter((card) =>
    ["queued", "running"].includes(card.progress.automationStatus),
  );

  return (
    <div className="page-shell">
      <DashboardAutoRefresh active={autoRefresh} />
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Parallel production dashboard for the stages launched from the committed outline.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Dashboard mode: <strong>{autoRefresh ? "LIVE" : "READY"}</strong>
          </div>
        </div>

        <div className="stage-list">
          <Link href="/" className="stage-chip">
            Library
          </Link>
          {STAGE_LINKS.map((stage) => (
            <Link key={stage.key} href={stage.href(slug)} className="stage-chip">
              {stage.label}
            </Link>
          ))}
        </div>
      </aside>

      <main className="main-column">
        <section className="glass-panel topbar">
          <div>
            <div className="label">Production Dashboard</div>
            <h2>Parallel Progress</h2>
            <div className="muted">
              Outline has been committed. The downstream stages are running independently and
              will populate their workspaces as they complete.
            </div>
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}/outline`}>
              Back to Outline
            </Link>
            <Link className="btn" href={`/books/${slug}/chapter-draft`}>
              Open Chapter Draft
            </Link>
          </div>
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <div>
              <h3>Now Running</h3>
              <div className="muted">
                This is the fastest way to see that the agents are actively working.
              </div>
            </div>
          </div>

          {activeCards.length > 0 ? (
            <div className="live-now-grid">
              {activeCards.map((card) => {
                const latestActivity =
                  card.progress.recentActivity[0] &&
                  typeof card.progress.recentActivity[0] === "object"
                    ? (card.progress.recentActivity[0] as { at?: string; message?: string })
                    : null;

                return (
                  <article className="live-now-card" key={`live-${card.key}`}>
                    <div className="live-now-header">
                      <div className="live-now-pulse" />
                      <strong>{card.label}</strong>
                      <span className="pill">{card.progress.automationStatus.replace(/_/g, " ")}</span>
                    </div>
                    <div className="live-now-message">
                      {card.progress.currentAction ?? "Working"}
                    </div>
                    <div className="muted">
                      {card.currentChapterLabel ? `On ${card.currentChapterLabel}` : "Preparing next step"}
                    </div>
                    {latestActivity?.message ? (
                      <div className="muted" style={{ marginTop: 6 }}>
                        Latest event: {latestActivity.message}
                      </div>
                    ) : null}
                    {latestActivity?.at ? (
                      <div className="muted" style={{ marginTop: 4 }}>
                        Updated {new Date(latestActivity.at).toLocaleTimeString()}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              No stages are actively running right now. When a stage starts, its live status and latest event will appear here immediately.
            </div>
          )}
        </section>

        <section className="glass-panel section-panel manuscript-progress-panel">
          <div className="section-header">
            <div>
              <h3>Manuscript Growth</h3>
              <div className="muted">
                Measured from the actual saved chapter drafts, not the writing target alone.
              </div>
            </div>
          </div>

          <div className="manuscript-progress-grid">
            <div className="metric-card">
              <div className="label">Drafted Chapters</div>
              <strong>
                {manuscriptMetrics.draftedChapters}/{manuscriptMetrics.totalChapters}
              </strong>
              <div className="stage-progress-bar" style={{ marginTop: 10 }}>
                <div
                  className="stage-progress-fill"
                  style={{ width: `${manuscriptMetrics.chapterProgressPercent}%` }}
                />
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                {manuscriptMetrics.chapterProgressPercent}% chapter coverage
              </div>
            </div>

            <div className="metric-card">
              <div className="label">Book Words</div>
              <strong>{manuscriptMetrics.wordsWritten.toLocaleString()}</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                Target {manuscriptMetrics.targetWordCount?.toLocaleString() ?? "not set"}
              </div>
              <div className="stage-progress-bar" style={{ marginTop: 10 }}>
                <div
                  className="stage-progress-fill"
                  style={{ width: `${manuscriptMetrics.wordProgressPercent}%` }}
                />
              </div>
              <div
                className={`manuscript-range-indicator status-${manuscriptMetrics.rangeStatus.toLowerCase()}`}
              >
                {rangeStatusLabel(manuscriptMetrics.rangeStatus)}
              </div>
              {manuscriptMetrics.targetWordCount ? (
                <div className="muted" style={{ marginTop: 6 }}>
                  Range {manuscriptMetrics.minimumWordCount?.toLocaleString()} to{" "}
                  {manuscriptMetrics.maximumWordCount?.toLocaleString()} words
                </div>
              ) : null}
            </div>

            <div className="metric-card">
              <div className="label">Estimated Book Pages</div>
              <strong>{manuscriptMetrics.pagesWritten.toLocaleString()}</strong>
              <div className="muted" style={{ marginTop: 6 }}>
                Target {manuscriptMetrics.targetPageCount?.toLocaleString() ?? "not set"}
              </div>
            </div>
          </div>
        </section>

        <section className="dashboard-grid">
          {cards.map((card) => (
            <article className="glass-panel dashboard-card" key={card.key}>
              <div className="dashboard-card-header">
                <div>
                  <div className="label">Parallel Stage</div>
                  <h3>{card.label}</h3>
                </div>
                <Link className="btn" href={card.href}>
                  Open Stage
                </Link>
              </div>

              <div className="speed-dial-row">
                <div
                  className="speed-dial"
                  style={dialStyle(
                    card.progress.percent,
                    card.stage?.status,
                    card.progress.automationStatus,
                  )}
                >
                  <div className="speed-dial-inner">
                    <strong>{card.progress.percent}%</strong>
                    <small className="speed-dial-current">{card.currentChapterLabel}</small>
                    <span>{card.stage?.status ?? "NOT_STARTED"}</span>
                  </div>
                </div>

                <div className="stack" style={{ gap: 10 }}>
                  <div className="metric">
                    Progress: {card.progress.completed}/{card.progress.total || 0} chapters
                  </div>
                  <div className="metric">
                    State: {card.progress.automationStatus.replace(/_/g, " ")}
                  </div>
                  {card.progress.currentAction ? (
                    <div className="metric">Current action: {card.progress.currentAction}</div>
                  ) : null}
                  {card.currentChapterLabel ? (
                    <div className="metric">Working on: {card.currentChapterLabel}</div>
                  ) : null}
                  {card.issueSummary ? (
                    <div className="metric">Issue summary: {card.issueSummary}</div>
                  ) : null}
                  {card.progress.failedChapters.length > 0 ? (
                    <div className="metric">Failed chapters: {card.progress.failedChapters.length}</div>
                  ) : null}
                  {card.progress.provisionalChapters.length > 0 ? (
                    <div className="metric">
                      Provisional chapters: {card.progress.provisionalChapters.length}
                    </div>
                  ) : null}
                  {card.progress.selectedFormat ? (
                    <div className="metric">Format: {card.progress.selectedFormat}</div>
                  ) : null}
                  <div className="button-row">
                    <form action={stopDashboardStage.bind(null, slug)}>
                      <input name="stageKey" type="hidden" value={card.stage?.stageKey ?? ""} />
                      <SubmitButton
                        className="btn"
                        disabled={!card.stage || !["queued", "running"].includes(card.progress.automationStatus)}
                        label="Stop"
                        pendingLabel="Stopping..."
                      />
                    </form>
                    <form action={retryDashboardStage.bind(null, slug)}>
                      <input name="stageKey" type="hidden" value={card.stage?.stageKey ?? ""} />
                      <SubmitButton
                        className="btn"
                        disabled={!card.stage}
                        label="Retry"
                        pendingLabel="Retrying..."
                      />
                    </form>
                    <form action={resumeFailedDashboardStage.bind(null, slug)}>
                      <input name="stageKey" type="hidden" value={card.stage?.stageKey ?? ""} />
                      <SubmitButton
                        className="btn"
                        disabled={!card.stage || card.progress.failedChapters.length === 0}
                        label="Resume Failed"
                        pendingLabel="Resuming..."
                      />
                    </form>
                  </div>
                </div>
              </div>

              {card.progress.recentActivity.length > 0 ? (
                <div className="card" style={{ marginTop: 18 }}>
                  <h4>Recent Activity</h4>
                  <div className="idea-list">
                    {card.progress.recentActivity.map((entry, index) => {
                      const item =
                        entry && typeof entry === "object"
                          ? (entry as { at?: string; message?: string })
                          : null;
                      if (!item?.message) {
                        return null;
                      }

                      return (
                        <article className="idea-card" key={`${card.key}-activity-${index}`}>
                          <strong>{item.message}</strong>
                          <div className="muted">
                            {item.at ? new Date(item.at).toLocaleTimeString() : "Recent"}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <h3>Live Feed</h3>
            <div className="muted">
              A rolling view of what the parallel stages are doing right now.
            </div>
          </div>

          {liveFeed.length > 0 ? (
            <div className="live-feed-list">
              {liveFeed.map((entry) => (
                <article
                  className={`live-feed-item ${entry.emphasis ? "active" : ""}`}
                  key={entry.key}
                >
                  <div className="live-feed-meta">
                    <strong>{entry.stageLabel}</strong>
                    <span>{new Date(entry.at).toLocaleTimeString()}</span>
                  </div>
                  <div className="live-feed-message">{entry.message}</div>
                  {entry.detail ? (
                    <div className="muted">{entry.detail}</div>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No live activity yet. The feed will populate when the downstream stages start.
            </div>
          )}
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <h3>Quality Agent</h3>
            <div className="muted">
              Automated checks for dossier coverage, source depth, and whether the
              downstream stages are strong enough to support drafting.
            </div>
          </div>

          <div className="speed-dial-row">
            <div className="speed-dial" style={dialStyle(quality.percent)}>
              <div className="speed-dial-inner">
                <strong>{quality.percent}%</strong>
                <span>{quality.status}</span>
              </div>
            </div>

            <div className="stack" style={{ gap: 10 }}>
              <div className="metric">
                Research ready: {quality.researchReadyCount}/{quality.totalChapters} chapters
              </div>
              <div className="metric">
                External stories ready: {quality.externalStoriesReadyCount}/{quality.totalChapters} chapters
              </div>
              <div className="metric">
                Base story ready: {quality.baseStoryReady ? "yes" : "no"}
              </div>
              <div className="metric">
                Issues flagged: {quality.issues.length}
              </div>
            </div>
          </div>

          {quality.issues.length > 0 ? (
            <div className="version-list" style={{ marginTop: 18 }}>
              {quality.issues.map((issue) => (
                <div className="version-item" key={issue}>
                  {issue}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ marginTop: 18 }}>
              Quality Agent is satisfied. The current parallel stages look strong enough
              to support drafting.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
