import Link from "next/link";

import {
  commentOnOutlineItem,
  commitOutlineStage,
  commitParagraphOutlineFromOutline,
  generateOutline,
  generateParagraphOutlineFromOutline,
} from "./actions";

import type { BookOutline, OutlineChapter, OutlineSection } from "@/lib/outline-types";
import { STAGE_LINKS } from "@/lib/navigation";
import { getOutlineWorkspace } from "@/lib/workflows/outline";
import { getParagraphOutlineWorkspace } from "@/lib/workflows/outline-paragraphs";

type SelectedTarget =
  | {
      type: "section";
      id: string;
      title: string;
      description: string;
      sectionNumber: number;
      chapterCount: number;
    }
  | {
      type: "chapter";
      id: string;
      title: string;
      description: string;
      chapterNumber: number;
      sectionId: string;
      sectionNumber: number;
      sectionTitle: string;
    }
  | null;

function getSelectedTarget(
  outline: BookOutline | null,
  targetType?: string,
  targetId?: string,
): SelectedTarget {
  if (!outline) {
    return null;
  }

  if (targetType === "chapter" && targetId) {
    for (const section of outline.sections) {
      const chapter = section.chapters.find((item) => item.id === targetId);

      if (chapter) {
        return {
          type: "chapter",
          id: chapter.id,
          title: chapter.title,
          description: chapter.description,
          chapterNumber: chapter.number,
          sectionId: section.id,
          sectionNumber: section.number,
          sectionTitle: section.title,
        };
      }
    }
  }

  if (targetType === "section" && targetId) {
    const section = outline.sections.find((item) => item.id === targetId);

    if (section) {
      return {
        type: "section",
        id: section.id,
        title: section.title,
        description: section.description,
        sectionNumber: section.number,
        chapterCount: section.chapters.length,
      };
    }
  }

  const firstSection = outline.sections[0];
  if (!firstSection) {
    return null;
  }

  return {
    type: "section",
    id: firstSection.id,
    title: firstSection.title,
    description: firstSection.description,
    sectionNumber: firstSection.number,
    chapterCount: firstSection.chapters.length,
  };
}

function isSelectedSection(target: SelectedTarget, section: OutlineSection) {
  return target?.type === "section" && target.id === section.id;
}

function isSelectedChapter(target: SelectedTarget, chapter: OutlineChapter) {
  return target?.type === "chapter" && target.id === chapter.id;
}

export default async function OutlineStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ targetType?: string; targetId?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const workspace = await getOutlineWorkspace(slug);
  const paragraphWorkspace = await getParagraphOutlineWorkspace(slug);
  const isReady = workspace.outlineReadiness.status === "ready";
  const isCommitted = workspace.outlineStage?.status === "COMMITTED";
  const outline = workspace.latestOutline;
  const selectedTarget = getSelectedTarget(outline, query.targetType, query.targetId);
  const paragraphOutline = paragraphWorkspace.latestParagraphOutline;
  const paragraphCommitted = Boolean(paragraphWorkspace.committedParagraphOutline);
  const paragraphChapterCount =
    paragraphOutline?.sections.reduce((sum, section) => sum + section.chapters.length, 0) ?? 0;
  const paragraphCount =
    paragraphOutline?.sections.reduce(
      (sum, section) =>
        sum +
        section.chapters.reduce(
          (chapterSum, chapter) => chapterSum + chapter.paragraphs.length,
          0,
        ),
      0,
    ) ?? 0;

  return (
    <div className="page-shell">
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Let the AI reason out the section and chapter architecture fully, then
            refine it through comments.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Outline status: <strong>{workspace.outlineStage?.status ?? "NOT_STARTED"}</strong>
          </div>
        </div>

        <div className="stage-list">
          {STAGE_LINKS.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href(slug)}
              className={`stage-chip ${stage.key === "OUTLINE" ? "active" : ""}`}
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
            <h2>Outline</h2>
            <div className="muted">
              Read the fully reasoned section and chapter map, then tell the system what
              to change.
            </div>
          </div>
          <div className="button-row">
            <Link className="btn" href={`/books/${slug}/promise`}>
              Back to Promise
            </Link>
            <Link className="btn" href={`/books/${slug}/dashboard`}>
              Open Dashboard
            </Link>
            {isCommitted ? (
              <>
                <form action={generateParagraphOutlineFromOutline.bind(null, slug)}>
                  <button className="btn" type="submit">
                    {paragraphOutline ? "Regenerate Paragraph Level" : "Generate Paragraph Level"}
                  </button>
                </form>
                <form action={commitParagraphOutlineFromOutline.bind(null, slug)}>
                  <button className="btn" disabled={!paragraphOutline} type="submit">
                    {paragraphCommitted ? "Recommit Paragraph Level" : "Commit Paragraph Level"}
                  </button>
                </form>
                <Link className="btn" href={`/books/${slug}/outline/paragraphs`}>
                  Open Paragraph Level
                </Link>
              </>
            ) : null}
            <form action={generateOutline.bind(null, slug)}>
              <input
                name="note"
                type="hidden"
                value="Generate a fully reasoned table of contents using the hierarchy section then chapter. Give each section a strong role in the book and each chapter a clear role inside its section."
              />
              <button className="btn" disabled={!isReady} type="submit">
                {outline ? "Generate Fresh Pass" : "Generate Outline"}
              </button>
            </form>
            <form action={commitOutlineStage.bind(null, slug)}>
              <button className="btn btn-primary" disabled={!outline} type="submit">
                {isCommitted ? "Recommit Outline" : "Commit Outline"}
              </button>
            </form>
          </div>
        </section>

        <section className="workspace-grid outline-workspace-grid">
          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>Strategic Foundation</h3>
              <div className="muted">
                The committed Promise anchors the section-and-chapter architecture.
              </div>
            </div>

            <div className="stack">
              {workspace.committedPromise ? (
                <>
                  <div className="card">
                    <h4>Promise Statement</h4>
                    <p style={{ margin: 0, lineHeight: 1.72 }}>
                      {workspace.committedPromise.promiseStatement}
                    </p>
                  </div>
                  <div className="card">
                    <h4>Outline Readiness</h4>
                    <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                      {workspace.outlineReadiness.nextMoves.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                  {isCommitted ? (
                    <div className="card">
                      <h4>Next Step: Paragraph Level</h4>
                      <div className="muted" style={{ lineHeight: 1.7 }}>
                        Once the section-and-chapter architecture is committed, the next outline pass expands each chapter into paragraph plans and topic sentences.
                      </div>
                      <div className="metric-row" style={{ marginTop: 12 }}>
                        <div className="metric">
                          Status: {paragraphOutline ? (paragraphCommitted ? "COMMITTED" : "READY TO REVIEW") : "NOT_STARTED"}
                        </div>
                        <div className="metric">Chapters planned: {paragraphChapterCount}</div>
                      </div>
                      <div className="metric-row" style={{ marginTop: 10 }}>
                        <div className="metric">Paragraphs planned: {paragraphCount}</div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="empty-state">
                  No committed Promise bundle exists yet. Commit the Promise stage
                  before building the outline.
                </div>
              )}
            </div>
          </section>

          <section className="glass-panel section-panel paper-wrap">
            <div className="paper toc-paper">
              <div className="toc-kicker">Table of Contents</div>
              <h3>{outline?.workingTitle ?? workspace.book.titleWorking ?? "Book Outline"}</h3>

              {outline ? (
                <div className="toc-list">
                  {outline.sections.map((section) => (
                    <article
                      className={`toc-entry ${isSelectedSection(selectedTarget, section) ? "selected" : ""}`}
                      key={section.id}
                    >
                      <Link
                        href={`/books/${slug}/outline?targetType=section&targetId=${section.id}`}
                        className="toc-link"
                      >
                        <div className="toc-line">
                          <span className="toc-number">Section {section.number}</span>
                          <span className="toc-title">{section.title}</span>
                        </div>
                        <p className="toc-description">{section.description}</p>
                      </Link>

                      <div className="toc-sublist">
                        {section.chapters.map((chapter) => (
                          <div
                            key={chapter.id}
                            className={`toc-subentry ${isSelectedChapter(selectedTarget, chapter) ? "selected" : ""}`}
                          >
                            <Link
                              href={`/books/${slug}/outline?targetType=chapter&targetId=${chapter.id}`}
                              className="toc-section-link"
                            >
                              <div className="toc-subtitle">Chapter {chapter.number}: {chapter.title}</div>
                              <div className="toc-subdescription">{chapter.description}</div>
                            </Link>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 0 }}>
                  Generate the first outline to see the book’s section-and-chapter table
                  of contents here.
                </div>
              )}
            </div>
          </section>
        </section>
      </main>

      <aside className="glass-panel rightbar">
        <div className="card">
          <h3>Comment Revision</h3>
          {selectedTarget ? (
            <>
              <div className="muted" style={{ lineHeight: 1.65 }}>
                {selectedTarget.type === "section"
                  ? `Editing Section ${selectedTarget.sectionNumber}`
                  : `Editing Chapter ${selectedTarget.chapterNumber} inside Section ${selectedTarget.sectionNumber}: ${selectedTarget.sectionTitle}`}
              </div>
              <div style={{ marginTop: 10, fontWeight: 600 }}>{selectedTarget.title}</div>
              <div className="muted" style={{ marginTop: 8, lineHeight: 1.65 }}>
                {selectedTarget.description}
              </div>

              <form
                action={commentOnOutlineItem.bind(null, slug)}
                style={{ marginTop: 16, display: "grid", gap: 12 }}
              >
                <input name="targetId" type="hidden" value={selectedTarget.id} />
                <input name="targetType" type="hidden" value={selectedTarget.type} />
                <textarea
                  name="comment"
                  placeholder={
                    selectedTarget.type === "section"
                      ? "Example: sharpen this section's role, split it, merge it, or make the movement of this part of the book clearer."
                      : "Example: rewrite this chapter title, make its role inside the section clearer, or change the chapter sequence."
                  }
                  style={{
                    width: "100%",
                    minHeight: 160,
                    resize: "vertical",
                    borderRadius: 16,
                    border: "1px solid var(--line)",
                    padding: 14,
                    background: "rgba(255,255,255,0.72)",
                  }}
                />
                <button className="btn btn-primary" disabled={!isReady} type="submit">
                  Revise Through Comment
                </button>
              </form>
            </>
          ) : (
            <div className="muted">
              Select a section or chapter from the middle table of contents, then leave
              a comment to create the next outline version.
            </div>
          )}
        </div>

        <div className="card">
          <h3>Version History</h3>
          <div className="version-list">
            {workspace.outlineVersions.length === 0 ? (
              <div className="muted">No outline versions yet.</div>
            ) : (
              workspace.outlineVersions.map((version) => (
                <div className="version-item" key={version.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong>v{version.versionNumber}</strong>
                    <span className="muted">{version.lifecycleState}</span>
                  </div>
                  <div className="muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
                    {version.outline?.overview ?? "Outline version"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <h3>What Commits Now</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
            <li>Section titles and their descriptions.</li>
            <li>Chapter titles and their descriptions inside each section.</li>
            <li>The top-level structure that will guide the paragraph-level expansion.</li>
          </ul>
        </div>

        {isCommitted ? (
          <div className="card">
            <h3>Next Subpage</h3>
            <div className="recommendation">
              The section-and-chapter outline is committed. The next page expands each
              chapter into paragraphs and topic sentences.
            </div>
            <div className="stack" style={{ padding: 0, marginTop: 12 }}>
              <div className="metric">
                Status: {paragraphOutline ? (paragraphCommitted ? "COMMITTED" : "READY TO REVIEW") : "NOT_STARTED"}
              </div>
              <div className="metric">Chapters: {paragraphChapterCount}</div>
              <div className="metric">Paragraphs: {paragraphCount}</div>
            </div>
            <div className="button-row" style={{ marginTop: 12 }}>
              <form action={generateParagraphOutlineFromOutline.bind(null, slug)}>
                <button className="btn" type="submit">
                  {paragraphOutline ? "Regenerate Paragraph Level" : "Generate Paragraph Level"}
                </button>
              </form>
              <Link className="btn" href={`/books/${slug}/outline/paragraphs`}>
                Open Paragraph Level
              </Link>
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
