import Link from "next/link";
import { StageStatus } from "@prisma/client";
import { AppTopBar } from "@/app/components/app-top-bar";
import { AgentChatPanel } from "../agent-chat-panel";
import type { PostProductionWorkspace } from "@/lib/workflows/post-production";

export function PostProductionPageShell({ workspace }: { workspace: PostProductionWorkspace }) {
  const { book, stage, stageKey, stageLabel, stageRoute, artifactCount, committedContent, stageLinks, persona } = workspace;

  return (
    <div className="dark-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppTopBar bookSlug={book.slug} bookTitle={book.titleWorking ?? undefined} activePage="studio" />
      <div className="page-shell" style={{ flex: 1, display: "flex" }}>

        {/* Left sidebar */}
        <aside className="glass-panel sidebar">
          <div className="brand-mark">
            <h1>GHOSTWRITR</h1>
            <p className="muted">{persona.tagline}</p>
          </div>

          <div className="muted" style={{ marginBottom: 20 }}>
            <div>Book: <strong>{book.titleWorking ?? "Untitled"}</strong></div>
            <div style={{ marginTop: 6 }}>
              {stageLabel}: <strong>{stage?.status ?? "NOT_STARTED"}</strong>
            </div>
          </div>

          <div className="stage-list">
            {stageLinks.map((s) => (
              <Link
                key={s.key}
                href={s.href}
                className={`stage-chip ${s.key === stageKey ? "active" : ""}`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </aside>

        {/* Main area — full height AgentChatPanel */}
        <main className="main-column" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <section className="glass-panel topbar" style={{ flexShrink: 0 }}>
            <div>
              <div className="label">Post-Production</div>
              <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span>{persona.icon}</span> {stageLabel}
              </h2>
              <div className="muted">{persona.tagline}</div>
            </div>
            <div className="button-row">
              <Link className="btn" href={`/books/${book.slug}`}>← Book Studio</Link>
              {stage?.status === "COMMITTED" && (
                <span className="pill" style={{ background: "rgba(74,124,89,0.15)", color: "#4a7c59", border: "1px solid rgba(74,124,89,0.3)" }}>
                  ◆ Committed
                </span>
              )}
            </div>
          </section>

          <div style={{ flex: 1, overflow: "hidden" }}>
            <AgentChatPanel
              slug={book.slug}
              stageKey={stageKey}
              stageLabel={stageLabel}
              stageRoute={stageRoute}
              status={(stage?.status ?? "NOT_STARTED") as StageStatus}
              artifactCount={artifactCount}
              bookTitle={book.titleWorking ?? "Untitled"}
              committedContent={committedContent}
              persistChat={true}
            />
          </div>
        </main>

        {/* Right sidebar */}
        <aside className="glass-panel rightbar">
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: persona.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {persona.icon}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{persona.name}</div>
                <div className="muted" style={{ fontSize: 11 }}>{persona.title}</div>
              </div>
            </div>
            <p className="muted" style={{ lineHeight: 1.7, fontSize: 13 }}>
              {persona.tagline}
            </p>
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>Book</h4>
            <p className="muted" style={{ marginTop: 0, lineHeight: 1.6, fontSize: 13 }}>
              {book.titleWorking ?? "Untitled"}
            </p>
            {stage?.committedAt && (
              <div className="pill" style={{ marginTop: 8, fontSize: 11 }}>
                Committed {new Date(stage.committedAt).toLocaleDateString()}
              </div>
            )}
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>How It Works</h4>
            <div className="recommendation">
              {persona.name} will automatically generate your {stageLabel.toLowerCase()} package when the stage is active.
            </div>
            <div className="recommendation">
              Review the draft in the chat, request changes, then commit when ready.
            </div>
            <div className="recommendation">
              Committed packages are synced to JARVIS for your launch dashboard.
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
