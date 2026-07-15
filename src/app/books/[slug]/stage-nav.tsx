"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StageKey } from "@prisma/client";
import type { StageGroup } from "@/lib/ui/stage-tokens";
import { STAGE_STATE_DISPLAY, GROUP_COLORS } from "@/lib/ui/stage-tokens";
import type { WorkspaceStage } from "./workspace-shell";
import styles from "./stage-nav.module.css";

interface StageNavProps {
  slug: string;
  title: string;
  subtitle?: string | null;
  coverImageUrl?: string | null;
  items: WorkspaceStage[];
  groupKeys: StageGroup[];
  selectedKey: StageKey;
  onSelect: (key: StageKey) => void;
}

export function StageNav({
  slug,
  title,
  subtitle,
  coverImageUrl,
  items,
  groupKeys,
  selectedKey,
  onSelect,
}: StageNavProps) {
  const router = useRouter();
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [subtitleDraft, setSubtitleDraft] = useState(subtitle ?? "");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);

  const committed = items.filter((item) => item.status === "COMMITTED").length;
  const progress = items.length ? Math.round((committed / items.length) * 100) : 0;

  const saveTitle = async () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === title) return;
    await fetch(`/api/books/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleWorking: trimmed }),
    });
    router.refresh();
  };

  const saveSubtitle = async () => {
    setEditingSubtitle(false);
    const trimmed = subtitleDraft.trim();
    if (trimmed === (subtitle ?? "")) return;
    await fetch(`/api/books/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtitle: trimmed }),
    });
    router.refresh();
  };

  return (
    <aside className={styles.nav} aria-label="Book journey">
      <div className={styles.bookIdentity}>
        <div className={styles.bookPortrait} aria-hidden>
          <span className={styles.pageEdges} />
          <span className={styles.bookCover}>
            {coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverImageUrl} alt="" />
            ) : (
              <>
                <span className={styles.coverImprint}>GHOSTWRITR</span>
                <span className={styles.coverTitle}>{title}</span>
                <span className={styles.coverFlourish}>✦</span>
              </>
            )}
          </span>
        </div>

        <div className={styles.identityCopy}>
          <div className={styles.eyebrow}>Private press edition</div>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className={styles.titleInput}
              value={titleDraft}
              autoFocus
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); void saveTitle(); }
                if (event.key === "Escape") { setTitleDraft(title); setEditingTitle(false); }
              }}
            />
          ) : (
            <button
              type="button"
              className={styles.bookName}
              onClick={() => { setTitleDraft(title); setEditingTitle(true); }}
              title="Edit title"
            >
              {title}
            </button>
          )}

          {editingSubtitle ? (
            <input
              ref={subtitleInputRef}
              className={styles.subtitleInput}
              value={subtitleDraft}
              autoFocus
              placeholder="Add subtitle…"
              onChange={(event) => setSubtitleDraft(event.target.value)}
              onBlur={() => void saveSubtitle()}
              onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); void saveSubtitle(); }
                if (event.key === "Escape") { setSubtitleDraft(subtitle ?? ""); setEditingSubtitle(false); }
              }}
            />
          ) : (
            <button
              type="button"
              className={styles.bookSubtitle}
              onClick={() => { setSubtitleDraft(subtitle ?? ""); setEditingSubtitle(true); }}
              title="Edit subtitle"
            >
              {subtitle || "Add subtitle…"}
            </button>
          )}
        </div>

        <div className={styles.bookProgress}>
          <span>{committed} of {items.length} rooms complete</span>
          <strong>{progress}%</strong>
          <div className={styles.progressTrack} aria-label={`${progress}% complete`}>
            <span style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

      <div className={styles.journeyHeading}>
        <span>The making of this book</span>
        <small>Choose a room</small>
      </div>

      <div className={styles.stages}>
        {groupKeys.map((group) => {
          const groupItems = items.filter((stage) => stage.group === group);
          if (!groupItems.length) return null;
          const colors = GROUP_COLORS[group];
          const groupDone = groupItems.every((stage) => stage.status === "COMMITTED");
          return (
            <section className={styles.group} key={group} style={{ "--group-color": colors.gutter } as React.CSSProperties}>
              <div className={styles.groupLabel}>
                <span>{colors.label}</span>
                {groupDone ? <small>Complete</small> : null}
              </div>
              <div className={styles.groupStages}>
                {groupItems.map((stage) => {
                  const display = STAGE_STATE_DISPLAY[stage.status];
                  const selected = stage.key === selectedKey;
                  return (
                    <button
                      type="button"
                      key={stage.key}
                      className={`${styles.stage} ${selected ? styles.selected : ""} ${stage.locked ? styles.locked : ""}`}
                      onClick={() => !stage.locked && onSelect(stage.key)}
                      disabled={stage.locked}
                      aria-current={selected ? "step" : undefined}
                      title={stage.locked ? "Complete the previous stage first" : stage.description}
                    >
                      <span className={styles.stageNumber}>{String(stage.number).padStart(2, "0")}</span>
                      <span className={styles.stageCopy}>
                        <strong>{stage.label}</strong>
                        <small>{selected ? stage.description : display.label}</small>
                      </span>
                      <span className={styles.stageState} style={{ color: display.color }} aria-label={display.ariaLabel}>
                        {display.shape}
                      </span>
                      {stage.artifactCount > 0 ? <span className={styles.artifactBadge}>{stage.artifactCount}</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
