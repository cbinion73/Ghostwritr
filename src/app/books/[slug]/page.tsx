import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { BookWorkflowType } from "@prisma/client";

import { getBookSpine, type SpineStageRow } from "@/lib/repositories/book-spine";
import { STAGE_TOKENS, GROUP_COLORS, type StageToken } from "@/lib/ui/stage-tokens";
import { getDefaultBookWorkspaceHref } from "@/lib/workflow-registry";

import { SpineRow } from "./spine-row";

/**
 * The Book Spine — the v1 hero screen per Sally's UX spec §3.
 *
 * A vertical list of all 11 pipeline stages, always visible, grouped
 * visually by gutter color (Setup / Material / Production). Each row
 * shows shape + color + word status badge (never color-alone encoding)
 * and deep-links to the existing per-stage editor page.
 *
 * The condensed-thinker reflex is to collapse the book into a summary;
 * this surface actively resists that by keeping the full 11-vertebra
 * spine in view at all times.
 */
export default async function BookSpinePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const spine = await getBookSpine(slug);

  if (!spine) {
    notFound();
  }

  if (spine.book.workflowType === BookWorkflowType.FICTION) {
    const activeStage =
      spine.stages.find((stage) => stage.status === "IN_PROGRESS")?.stageKey ??
      spine.stages.find((stage) => stage.status === "READY_FOR_REVIEW")?.stageKey ??
      spine.stages.find((stage) => stage.status === "COMMITTED")?.stageKey ??
      null;
    redirect(getDefaultBookWorkspaceHref(spine.book.workflowType, slug, activeStage));
  }

  // Index stage rows by key so we can look up each token's status
  const stageByKey = new Map(spine.stages.map((s) => [s.stageKey, s]));
  const blankStage: Omit<SpineStageRow, "stageKey"> = {
    status: "NOT_STARTED",
    artifactCount: 0,
    updatedAt: null,
    committedAt: null,
  };

  // Group tokens for visual separation
  const grouped: Array<{ group: StageToken["group"]; tokens: StageToken[] }> = [
    { group: "setup", tokens: STAGE_TOKENS.filter((t) => t.group === "setup") },
    { group: "material", tokens: STAGE_TOKENS.filter((t) => t.group === "material") },
    { group: "production", tokens: STAGE_TOKENS.filter((t) => t.group === "production") },
  ];

  const totalCommitted = spine.stages.filter((s) => s.status === "COMMITTED").length;
  const totalArtifacts = spine.stages.reduce((sum, s) => sum + s.artifactCount, 0);

  const title = spine.book.titleWorking ?? slug;
  const subtitle = spine.book.subtitle;

  return (
    <main style={pageStyle}>
      {/* Header — book title, progress summary */}
      <header style={headerStyle}>
        <div>
          <nav style={breadcrumbStyle}>
            <Link href="/" style={breadcrumbLinkStyle}>
              ← Library
            </Link>
          </nav>
          <h1 style={titleStyle}>{title}</h1>
          {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
        </div>
        <div style={summaryStyle}>
          <SummaryPill label="Stages committed" value={`${totalCommitted} / 11`} />
          <SummaryPill label="Total artifacts" value={totalArtifacts.toString()} />
        </div>
      </header>

      <section style={sectionStyle} aria-label="Book pipeline spine">
        {grouped.map(({ group, tokens }) => {
          const g = GROUP_COLORS[group];
          return (
            <div key={group} style={groupWrapStyle}>
              <div style={groupLabelStyle}>
                <span
                  aria-hidden="true"
                  style={{
                    ...groupBulletStyle,
                    background: g.gutter,
                  }}
                />
                <span>{g.label}</span>
                <span style={groupRuleStyle} aria-hidden="true" />
              </div>
              <div style={groupRowsStyle}>
                {tokens.map((token) => {
                  const row = stageByKey.get(token.key);
                  return (
                    <SpineRow
                      key={token.key}
                      token={token}
                      status={row?.status ?? blankStage.status}
                      artifactCount={row?.artifactCount ?? blankStage.artifactCount}
                      updatedAt={row?.updatedAt ?? blankStage.updatedAt}
                      slug={slug}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <footer style={footerStyle}>
        <p style={footerNoteStyle}>
          The spine shows the whole book at a glance. Each row deep-links to its editor.
          Stages with no prior activity show as <strong>LOCKED</strong> with the em-dash
          glyph — this is not an error state, just "not yet begun."
        </p>
      </footer>
    </main>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div style={pillStyle}>
      <span style={pillLabelStyle}>{label}</span>
      <span style={pillValueStyle}>{value}</span>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  maxWidth: "960px",
  margin: "0 auto",
  padding: "48px 32px 80px",
  fontFamily: '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif',
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "24px",
  paddingBottom: "20px",
  borderBottom: "1px solid rgba(45, 36, 29, 0.1)",
  marginBottom: "28px",
};

const breadcrumbStyle: React.CSSProperties = {
  marginBottom: "10px",
};

const breadcrumbLinkStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6f6256",
  textDecoration: "none",
  letterSpacing: "0.02em",
};

const titleStyle: React.CSSProperties = {
  margin: "0 0 4px 0",
  fontSize: "32px",
  fontWeight: 700,
  color: "#2d241d",
  lineHeight: 1.2,
};

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "15px",
  color: "#6f6256",
  lineHeight: 1.4,
};

const summaryStyle: React.CSSProperties = {
  display: "flex",
  gap: "10px",
  flexShrink: 0,
};

const pillStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: "6px",
  background: "rgba(254, 251, 245, 0.8)",
  border: "1px solid rgba(45, 36, 29, 0.1)",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  minWidth: "100px",
};

const pillLabelStyle: React.CSSProperties = {
  fontSize: "10px",
  color: "#8a7a6a",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 600,
};

const pillValueStyle: React.CSSProperties = {
  fontSize: "18px",
  color: "#2d241d",
  fontWeight: 700,
  fontFamily: "JetBrains Mono, ui-monospace, monospace",
  fontFeatureSettings: `"tnum" 1`,
};

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "28px",
};

const groupWrapStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

const groupLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  paddingLeft: "6px",
  fontSize: "11px",
  fontWeight: 600,
  color: "#6f6256",
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};

const groupBulletStyle: React.CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "2px",
  display: "inline-block",
};

const groupRuleStyle: React.CSSProperties = {
  flex: 1,
  height: "1px",
  background: "rgba(45, 36, 29, 0.08)",
  marginLeft: "4px",
};

const groupRowsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

const footerStyle: React.CSSProperties = {
  marginTop: "40px",
  paddingTop: "20px",
  borderTop: "1px solid rgba(45, 36, 29, 0.08)",
};

const footerNoteStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "12px",
  color: "#8a7a6a",
  lineHeight: 1.5,
  maxWidth: "640px",
};
