import Link from "next/link";

import type { getPromiseWorkspace } from "@/lib/workflows/promise-public";

type PromiseWorkspace = Awaited<ReturnType<typeof getPromiseWorkspace>>;

type GuideItem = {
  label: string;
  detail: string;
  complete: boolean;
  href: string;
};

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function statusLabel(complete: boolean) {
  return complete ? "Ready" : "Needs attention";
}

function statusStyle(complete: boolean): React.CSSProperties {
  return {
    borderRadius: 999,
    border: `1px solid ${complete ? "rgba(74,124,89,0.3)" : "rgba(184,121,58,0.3)"}`,
    background: complete ? "rgba(74,124,89,0.15)" : "rgba(184,121,58,0.12)",
    color: complete ? "#b8d8bd" : "#c9a96e",
    fontSize: 11,
    padding: "3px 8px",
    whiteSpace: "nowrap",
  };
}

export function Phase1GuidedJourneyPanel({
  slug,
  workspace,
}: {
  slug: string;
  workspace: PromiseWorkspace;
}) {
  const setup = workspace.bookSetupProfile;
  const comparableCount = workspace.market.comparisonTitles.length;
  const personaCount = workspace.personas.personas.length;
  const audienceSignalCount =
    (workspace.audienceResearch?.phase1?.identifiedUserTypes.length ?? 0) +
    (workspace.audienceResearch?.phase1?.researchQuestions.length ?? 0);
  const outputFormats = setup?.outputFormats ?? [];
  const voiceBlend = setup?.writerPersonaBlend ?? [];
  const approvedBrief = workspace.phase1StrategicBrief;

  const guideItems: GuideItem[] = [
    {
      label: "Book Setup",
      complete: Boolean(setup),
      detail: setup
        ? `${setup.workingTitle || workspace.book.titleWorking || "Untitled"} · ${setup.baseStoryFormatPreference}`
        : "Commit setup before locking Phase 1.",
      href: `/books/${slug}?stage=BOOK_SETUP`,
    },
    {
      label: "Promise",
      complete: workspace.artifactAvailability.promiseBrief && workspace.artifactAvailability.bookPromiseReport,
      detail: workspace.bookPromiseReport?.corePromise || workspace.promiseBrief.promiseStatement || "Approve the final book promise.",
      href: `/books/${slug}?stage=PROMISE`,
    },
    {
      label: "Readers & Personas",
      complete: workspace.artifactAvailability.audienceResearch || personaCount > 0,
      detail:
        personaCount > 0
          ? `${formatCount(personaCount, "persona")} · ${formatCount(audienceSignalCount, "audience signal")}`
          : "Define the real reader segments and buying language.",
      href: `/books/${slug}?stage=PROMISE`,
    },
    {
      label: "Three Comparable Titles",
      complete: comparableCount === 3,
      detail:
        comparableCount === 3
          ? workspace.market.comparisonTitles.map((title) => title.title).join(" · ")
          : `Phase 1 requires exactly 3; currently ${comparableCount}.`,
      href: `/books/${slug}?stage=PROMISE`,
    },
    {
      label: "Market Analysis",
      complete: workspace.artifactAvailability.market,
      detail: workspace.market.marketCategory || "Lock category, risks, opportunity, and recommendation.",
      href: `/books/${slug}?stage=PROMISE`,
    },
    {
      label: "Voice, Length & KDP",
      complete: Boolean(
        setup?.targetWordCount &&
        setup.trimSize &&
        outputFormats.length > 0 &&
        (setup.voiceTone || voiceBlend.length > 0),
      ),
      detail: [
        setup?.targetWordCount ? `${setup.targetWordCount.toLocaleString()} words` : "word count needed",
        setup?.trimSize || "trim size needed",
        outputFormats.length ? outputFormats.join("/") : "formats needed",
      ].join(" · "),
      href: `/books/${slug}?stage=BOOK_SETUP`,
    },
  ];

  const readyCount = guideItems.filter((item) => item.complete).length;

  return (
    <section
      className="glass-panel"
      style={{
        margin: "10px 4px 0",
        padding: 14,
        flexShrink: 0,
        borderColor: approvedBrief ? "rgba(74,124,89,0.3)" : "rgba(184,121,58,0.26)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="microlabel" style={{ color: "var(--muted)" }}>
            Unified Phase 1 · Strategic Brief Gate
          </div>
          <h3 style={{ margin: "5px 0", fontSize: "1rem" }}>
            {approvedBrief ? "Approved strategic brief is committed" : "Guide the foundation into one approved brief"}
          </h3>
          <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
            {approvedBrief
              ? `Brief v${approvedBrief.versionNumber} is the downstream source for outline, story, research, drafting, and production choices.`
              : "Finish these Phase 1 ingredients before committing Promise; commit creates the single strategic artifact downstream stages should trust."}
          </p>
        </div>
        <div style={statusStyle(Boolean(approvedBrief))}>
          {approvedBrief ? "Brief committed" : `${readyCount}/${guideItems.length} ready`}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 8,
          marginTop: 12,
        }}
      >
        {guideItems.map((item) => (
          <Link
            href={item.href}
            key={item.label}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 10,
              background: item.complete ? "rgba(74,124,89,0.08)" : "rgba(255,255,255,0.035)",
              color: "inherit",
              textDecoration: "none",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
              <strong style={{ fontSize: 12 }}>{item.label}</strong>
              <span style={statusStyle(item.complete)}>{statusLabel(item.complete)}</span>
            </div>
            <div className="muted" style={{ marginTop: 6, fontSize: 11, lineHeight: 1.35 }}>
              {item.detail}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
