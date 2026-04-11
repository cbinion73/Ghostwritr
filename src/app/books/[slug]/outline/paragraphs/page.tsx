import Link from "next/link";

import {
  commentOnParagraphOutline,
  commitParagraphOutline,
  generateParagraphOutline,
} from "./actions";

import type { ChapterParagraphPlan, ParagraphOutline } from "@/lib/paragraph-outline-types";
import { STAGE_LINKS } from "@/lib/navigation";
import { getParagraphOutlineWorkspace } from "@/lib/workflows/outline-paragraphs";

type SelectedTarget =
  | {
      type: "chapter";
      id: string;
      chapterTitle: string;
      chapterDescription: string;
      chapterNumber: number;
      sectionNumber: number;
      sectionTitle: string;
    }
  | {
      type: "paragraph";
      id: string;
      topicSentence: string;
      purpose: string;
      chapterNumber: number;
      chapterTitle: string;
      sectionNumber: number;
      sectionTitle: string;
    }
  | null;

function getSelectedTarget(
  paragraphOutline: ParagraphOutline | null,
  targetType?: string,
  targetId?: string,
): SelectedTarget {
  if (!paragraphOutline) {
    return null;
  }

  if (targetType === "paragraph" && targetId) {
    for (const section of paragraphOutline.sections) {
      for (const chapter of section.chapters) {
        const paragraph = chapter.paragraphs.find((item) => item.id === targetId);
        if (paragraph) {
          return {
            type: "paragraph",
            id: paragraph.id,
            topicSentence: paragraph.topicSentence,
            purpose: paragraph.purpose,
            chapterNumber: chapter.chapterNumber,
            chapterTitle: chapter.chapterTitle,
            sectionNumber: section.sectionNumber,
            sectionTitle: section.sectionTitle,
          };
        }
      }
    }
  }

  if (targetType === "chapter" && targetId) {
    for (const section of paragraphOutline.sections) {
      const chapter = section.chapters.find((item) => item.chapterId === targetId);
      if (chapter) {
        return {
          type: "chapter",
          id: chapter.chapterId,
          chapterTitle: chapter.chapterTitle,
          chapterDescription: chapter.chapterDescription,
          chapterNumber: chapter.chapterNumber,
          sectionNumber: section.sectionNumber,
          sectionTitle: section.sectionTitle,
        };
      }
    }
  }

  const firstSection = paragraphOutline.sections[0];
  const firstChapter = firstSection?.chapters[0];
  if (!firstSection || !firstChapter) {
    return null;
  }

  return {
    type: "chapter",
    id: firstChapter.chapterId,
    chapterTitle: firstChapter.chapterTitle,
    chapterDescription: firstChapter.chapterDescription,
    chapterNumber: firstChapter.chapterNumber,
    sectionNumber: firstSection.sectionNumber,
    sectionTitle: firstSection.sectionTitle,
  };
}

function isSelectedChapter(target: SelectedTarget, chapter: ChapterParagraphPlan) {
  return target?.type === "chapter" && target.id === chapter.chapterId;
}

function isSelectedParagraph(target: SelectedTarget, paragraphId: string) {
  return target?.type === "paragraph" && target.id === paragraphId;
}

export default async function ParagraphOutlinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ targetType?: string; targetId?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const workspace = await getParagraphOutlineWorkspace(slug);
  const paragraphOutline = workspace.latestParagraphOutline;
  const selectedTarget = getSelectedTarget(
    paragraphOutline,
    query.targetType,
    query.targetId,
  );
  const isReady = workspace.readiness.status === "ready";
  const isCommitted = Boolean(workspace.committedParagraphOutline);

  return (
    <div className="page-shell">
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Expand the committed hierarchy from sections and chapters into paragraphs and
            topic sentences.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Paragraph outline: <strong>{paragraphOutline ? "IN_PROGRESS" : "NOT_STARTED"}</strong>
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
            <div className="label">Outline Expansion</div>
            <h2>Paragraph Level</h2>
            <div className="muted">
              This page follows the committed `section &gt; chapter` outline.
            </div>
          </div>
          <div className="button-row">
            <Link className="btn" href={`/books/${slug}/outline`}>
              Back to Outline
            </Link>
            <form action={generateParagraphOutline.bind(null, slug)}>
              <button className="btn" disabled={!isReady} type="submit">
                {paragraphOutline ? "Generate Fresh Paragraph Pass" : "Generate Paragraph Level"}
              </button>
            </form>
            <form action={commitParagraphOutline.bind(null, slug)}>
              <button className="btn btn-primary" disabled={!paragraphOutline} type="submit">
                {isCommitted ? "Recommit Paragraph Level" : "Commit Paragraph Level"}
              </button>
            </form>
          </div>
        </section>

        <section className="workspace-grid outline-workspace-grid">
          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>Committed Foundation</h3>
              <div className="muted">
                Paragraph plans inherit the committed section-and-chapter structure.
              </div>
            </div>

            <div className="stack">
              {workspace.committedOutline ? (
                <>
                  <div className="card">
                    <h4>Outline Overview</h4>
                    <p style={{ margin: 0, lineHeight: 1.72 }}>
                      {workspace.committedOutline.overview}
                    </p>
                  </div>
                  <div className="card">
                    <h4>Next Moves</h4>
                    <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                      {workspace.readiness.nextMoves.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  Commit the section-and-chapter outline first, then this paragraph-level
                  page will unlock.
                </div>
              )}
            </div>
          </section>

          <section className="glass-panel section-panel paper-wrap">
            <div className="paper toc-paper">
              <div className="toc-kicker">Paragraph Outline</div>
              <h3>{paragraphOutline?.workingTitle ?? workspace.book.titleWorking ?? "Paragraph Outline"}</h3>

              {paragraphOutline ? (
                <div className="toc-list">
                  {paragraphOutline.sections.map((section) => (
                    <article className="toc-entry" key={section.sectionId}>
                      <div className="toc-line">
                        <span className="toc-number">Section {section.sectionNumber}</span>
                        <span className="toc-title">{section.sectionTitle}</span>
                      </div>
                      <p className="toc-description">{section.sectionDescription}</p>

                      <div className="toc-sublist">
                        {section.chapters.map((chapter) => (
                          <div
                            key={chapter.chapterId}
                            className={`toc-subentry ${isSelectedChapter(selectedTarget, chapter) ? "selected" : ""}`}
                          >
                            <Link
                              href={`/books/${slug}/outline/paragraphs?targetType=chapter&targetId=${chapter.chapterId}`}
                              className="toc-section-link"
                            >
                              <div className="toc-subtitle">
                                Chapter {chapter.chapterNumber}: {chapter.chapterTitle}
                              </div>
                              <div className="toc-subdescription">{chapter.chapterDescription}</div>
                            </Link>

                            <div className="toc-subchapter-list">
                              {chapter.paragraphs.map((paragraph) => (
                                <Link
                                  key={paragraph.id}
                                  href={`/books/${slug}/outline/paragraphs?targetType=paragraph&targetId=${paragraph.id}`}
                                  className={`toc-subchapter ${isSelectedParagraph(selectedTarget, paragraph.id) ? "selected" : ""}`}
                                >
                                  <div className="toc-subchapter-title">
                                    {paragraph.topicSentence}
                                  </div>
                                  <div className="toc-subchapter-description">
                                    {paragraph.purpose}
                                  </div>
                                </Link>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 0 }}>
                  Generate the paragraph-level outline to see topic sentences appear here.
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
                {selectedTarget.type === "chapter"
                  ? `Editing Chapter ${selectedTarget.chapterNumber} inside Section ${selectedTarget.sectionNumber}: ${selectedTarget.sectionTitle}`
                  : `Editing a paragraph inside Chapter ${selectedTarget.chapterNumber}, Section ${selectedTarget.sectionNumber}`}
              </div>
              <div style={{ marginTop: 10, fontWeight: 600 }}>
                {selectedTarget.type === "chapter"
                  ? selectedTarget.chapterTitle
                  : selectedTarget.topicSentence}
              </div>
              <div className="muted" style={{ marginTop: 8, lineHeight: 1.65 }}>
                {selectedTarget.type === "chapter"
                  ? selectedTarget.chapterDescription
                  : selectedTarget.purpose}
              </div>

              <form
                action={commentOnParagraphOutline.bind(null, slug)}
                style={{ marginTop: 16, display: "grid", gap: 12 }}
              >
                <input name="targetId" type="hidden" value={selectedTarget.id} />
                <input name="targetType" type="hidden" value={selectedTarget.type} />
                <textarea
                  name="comment"
                  placeholder={
                    selectedTarget.type === "chapter"
                      ? "Example: make this chapter flow more logically, improve its paragraph sequence, or sharpen what the chapter is trying to prove."
                      : "Example: rewrite this topic sentence, make the paragraph more concrete, or change the work this paragraph is doing."
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
              Select a chapter or paragraph from the middle manuscript and leave a
              comment to generate the next version.
            </div>
          )}
        </div>

        <div className="card">
          <h3>Version History</h3>
          <div className="version-list">
            {workspace.paragraphVersions.length === 0 ? (
              <div className="muted">No paragraph-level versions yet.</div>
            ) : (
              workspace.paragraphVersions.map((version) => (
                <div className="version-item" key={version.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong>v{version.versionNumber}</strong>
                    <span className="muted">{version.lifecycleState}</span>
                  </div>
                  <div className="muted" style={{ marginTop: 8, lineHeight: 1.55 }}>
                    {version.paragraphOutline.overview}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
