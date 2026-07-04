"use client";

/**
 * The digital brain — Obsidian/Roam-style backlinked notes for a committed
 * chapter's research facts and external stories. System-generated links
 * only (no manual link authoring); fetches from
 * /api/books/[slug]/chapters/[chapterKey]/linked-notes.
 */

import { useEffect, useState } from "react";

type LinkedResearchNote = {
  id: string;
  itemType: string;
  claimText: string;
  evidenceExcerpt: string | null;
  sourceTier: string;
  verificationStatus: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  usedInDraft?: boolean;
};

type LinkedStoryNote = {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  storyType: string;
  storyFit: string;
  sourceTier: string;
  verificationStatus: string;
  sourceTitle: string | null;
  sourceUrl: string | null;
  usedInDraft?: boolean;
};

type LinkedNoteBacklink = { researchItemId: string; storyItemId: string; reason: string };

type ChapterLinkedNotes = {
  chapterKey: string;
  research: LinkedResearchNote[];
  stories: LinkedStoryNote[];
  backlinks: LinkedNoteBacklink[];
};

function tierLabel(tier: string) {
  return tier === "A" ? "Tier A" : tier === "B" ? "Tier B" : "Tier C";
}

function tierColor(tier: string) {
  if (tier === "A") return "var(--green-ink, #2f5d43)";
  if (tier === "B") return "var(--gold, #9a7c39)";
  return "var(--rust, #a5462f)";
}

function verificationLabel(status: string) {
  switch (status) {
    case "VERIFIED": return "Verified";
    case "REJECTED": return "Rejected";
    case "NEEDS_CORROBORATION": return "Needs corroboration";
    default: return "Pending";
  }
}

export function ChapterLinkedNotes({ slug, chapterKey }: { slug: string; chapterKey: string }) {
  const [data, setData] = useState<ChapterLinkedNotes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/books/${slug}/chapters/${encodeURIComponent(chapterKey)}/linked-notes`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load notes (${res.status})`);
        return res.json();
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load notes");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, chapterKey]);

  if (loading) {
    return <div style={styles.empty}>Loading research &amp; stories…</div>;
  }
  if (error) {
    return <div style={styles.empty}>{error}</div>;
  }
  if (!data || (data.research.length === 0 && data.stories.length === 0)) {
    return <div style={styles.empty}>No committed research or external stories for this chapter yet.</div>;
  }

  // Map research item id -> connected story titles, for inline backlink text.
  const storyById = new Map(data.stories.map((s) => [s.id, s]));
  const linksByResearch = new Map<string, LinkedStoryNote[]>();
  for (const link of data.backlinks) {
    const story = storyById.get(link.storyItemId);
    if (!story) continue;
    const list = linksByResearch.get(link.researchItemId) ?? [];
    list.push(story);
    linksByResearch.set(link.researchItemId, list);
  }

  return (
    <div style={styles.brain}>
      {data.research.length > 0 && (
        <div style={styles.column}>
          <div className="microlabel" style={styles.columnLabel}>Research — {data.research.length}</div>
          {data.research.map((note) => {
            const isDossier = note.itemType === "DOSSIER";
            return (
              <div key={note.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <span className="microlabel" style={{ color: "var(--muted)" }}>
                    {isDossier ? "Research Dossier" : note.itemType.replace(/_/g, " ")}
                  </span>
                  <span style={{ ...styles.tierBadge, color: tierColor(note.sourceTier) }}>
                    {note.usedInDraft && <span style={styles.usedBadge}>✒ in draft · </span>}
                    {tierLabel(note.sourceTier)} · {verificationLabel(note.verificationStatus)}
                  </span>
                </div>
                <p style={isDossier ? styles.dossierText : styles.claim}>{note.claimText}</p>
                {note.sourceTitle && (
                  <div style={styles.sourceLine}>
                    Source: {note.sourceUrl ? (
                      <a href={note.sourceUrl} target="_blank" rel="noreferrer" style={styles.sourceLink}>
                        {note.sourceTitle}
                      </a>
                    ) : note.sourceTitle}
                  </div>
                )}
                {(linksByResearch.get(note.id) ?? []).map((story) => (
                  <div key={story.id} style={styles.backlink}>
                    ↳ related: <span style={styles.backlinkTarget}>[[{story.title}]]</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {data.stories.length > 0 && (
        <div style={styles.column}>
          <div className="microlabel" style={styles.columnLabel}>External Stories — {data.stories.length}</div>
          {data.stories.map((story) => {
            const isDossier = story.storyType === "DOSSIER";
            return (
              <div key={story.id} style={styles.card}>
                <div style={styles.cardTop}>
                  <span className="microlabel" style={{ color: "var(--muted)" }}>
                    {isDossier ? "External Story Dossier" : `${story.storyType.replace(/_/g, " ")} · ${story.storyFit.replace(/_/g, " ").toLowerCase()}`}
                  </span>
                  <span style={{ ...styles.tierBadge, color: tierColor(story.sourceTier) }}>
                    {story.usedInDraft && <span style={styles.usedBadge}>✒ in draft · </span>}
                    {tierLabel(story.sourceTier)} · {verificationLabel(story.verificationStatus)}
                  </span>
                </div>
                {!isDossier && <div style={styles.storyTitle}>[[{story.title}]]</div>}
                <p style={isDossier ? styles.dossierText : styles.claim}>{story.summary}</p>
                {story.whyItMatters && <p style={styles.whyItMatters}>{story.whyItMatters}</p>}
                {story.sourceTitle && (
                  <div style={styles.sourceLine}>
                    Source: {story.sourceUrl ? (
                      <a href={story.sourceUrl} target="_blank" rel="noreferrer" style={styles.sourceLink}>
                        {story.sourceTitle}
                      </a>
                    ) : story.sourceTitle}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    padding: "16px 4px",
    fontSize: 13,
    fontStyle: "italic",
    color: "var(--muted, #6f6256)",
  },
  brain: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
    padding: "10px 2px 4px",
  },
  column: { display: "grid", gap: 10, alignContent: "start" },
  columnLabel: { color: "var(--muted, #6f6256)", marginBottom: 2 },
  card: {
    background: "var(--paper, #f2ebdc)",
    border: "1px solid var(--line, rgba(59,44,31,0.14))",
    borderRadius: 6,
    padding: "10px 12px",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 6,
  },
  tierBadge: {
    fontFamily: "var(--mono, ui-monospace)" as string,
    fontSize: 9.5,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },
  usedBadge: {
    color: "var(--green-ink, #2f5d43)",
    fontWeight: 700,
  },
  claim: {
    margin: "0 0 6px",
    fontSize: 13.5,
    lineHeight: 1.5,
    color: "var(--ink, #282318)",
  },
  dossierText: {
    margin: "0 0 6px",
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--ink, #282318)",
    whiteSpace: "pre-wrap",
    maxHeight: 320,
    overflowY: "auto",
  },
  whyItMatters: {
    margin: "0 0 6px",
    fontSize: 12.5,
    lineHeight: 1.5,
    color: "var(--muted, #6f6256)",
    fontStyle: "italic",
  },
  storyTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--green-ink, #2f5d43)",
    marginBottom: 4,
  },
  sourceLine: {
    fontSize: 11.5,
    color: "var(--muted, #6f6256)",
    marginTop: 4,
  },
  sourceLink: { color: "var(--green-ink, #2f5d43)" },
  backlink: {
    fontSize: 12,
    fontStyle: "italic",
    color: "var(--gold, #9a7c39)",
    marginTop: 6,
    paddingTop: 6,
    borderTop: "1px dashed var(--line, rgba(59,44,31,0.14))",
  },
  backlinkTarget: { fontStyle: "normal", fontWeight: 600 },
};
