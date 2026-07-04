import Link from "next/link";

import { commitMarketAnalysisStage } from "./actions";
import { AppTopBar } from "@/app/components/app-top-bar";

import { STAGE_LINKS } from "@/lib/navigation";
import { getPromiseWorkspace } from "@/lib/workflows/promise";

export default async function MarketAnalysisStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getPromiseWorkspace(slug);
  const isCommitted = workspace.stage?.status === "COMMITTED";

  return (
    <div className="dark-shell" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <AppTopBar bookSlug={slug} bookTitle={workspace.book.titleWorking ?? undefined} activePage="studio" />
      <div className="page-shell" style={{ flex: 1 }}>
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Look at positioning, comparables, and sellability before we deepen the
            manuscript.
          </p>
        </div>

        <div className="muted" style={{ marginBottom: 20 }}>
          <div>
            Book: <strong>{workspace.book.titleWorking ?? "Untitled Book"}</strong>
          </div>
          <div style={{ marginTop: 6 }}>
            Upstream status: <strong>{workspace.stage?.status ?? "IN_PROGRESS"}</strong>
          </div>
        </div>

        <div className="stage-list">
          {STAGE_LINKS.map((stage) => (
            <Link
              key={stage.key}
              href={stage.href(slug)}
              className={`stage-chip ${stage.key === "MARKET_ANALYSIS" ? "active" : ""}`}
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
            <h2>Market Analysis</h2>
            <div className="muted">
              Use comparables, risks, and recommendations to sharpen how the book will
              land in the real market.
            </div>
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}`}>← Book Studio</Link>
            <Link className="btn" href={`/books/${slug}/promise`}>
              Refine in Promise
            </Link>
            <Link className="btn" href={`/books/${slug}/outline`}>
              Continue to Outline
            </Link>
            <form action={commitMarketAnalysisStage.bind(null, slug)}>
              <button className="btn btn-primary" type="submit">
                {isCommitted ? "Recommit Upstream Bundle" : "Commit Upstream Bundle"}
              </button>
              {/* Explicit human override for the 70/100 (3.5/5) viability gate. */}
              <button className="btn" type="submit" name="force" value="true" style={{ marginLeft: 8 }}>
                Commit Anyway
              </button>
            </form>
          </div>
        </section>

        <section className="workspace-grid outline-workspace-grid">
          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>Commercial Read</h3>
              <div className="muted">
                This stage should tell us whether the book is attractive, too broad,
                or missing a clear wedge.
              </div>
            </div>

            <div className="stack">
              <div className="card">
                <h4>Market Category</h4>
                <p style={{ margin: 0, lineHeight: 1.72 }}>
                  {workspace.market.marketCategory}
                </p>
              </div>

              <div className="card">
                <h4>Saturation Assessment</h4>
                <p style={{ margin: 0, lineHeight: 1.72 }}>
                  {workspace.market.saturationAssessment}
                </p>
              </div>

              <div className="card">
                <h4>Commercial Risks</h4>
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                  {workspace.market.commercialRisks.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="glass-panel section-panel paper-wrap">
            <article className="paper market-paper">
              <div className="toc-kicker">Market Landscape</div>
              <h3>Comparable Titles</h3>
              <div className="market-list">
                {workspace.market.comparisonTitles.map((title) => (
                  <section className="market-card" key={`${title.title}-${title.author}`}>
                    <div className="market-title-row">
                      <div>
                        <div className="persona-name">{title.title}</div>
                        <div className="muted">{title.author}</div>
                      </div>
                    </div>
                    <p>
                      <strong>Why relevant:</strong> {title.whyRelevant}
                    </p>
                    <p>
                      <strong>Difference opportunity:</strong> {title.differenceOpportunity}
                    </p>
                  </section>
                ))}
              </div>
            </article>
          </section>
        </section>

        <section className="glass-panel section-panel">
          <div className="section-header">
            <h3>Positioning Recommendations</h3>
            <div className="muted">
              These recommendations should shape titles, messaging, and downstream
              structural choices.
            </div>
          </div>

          <div className="compare-grid">
            <div className="compare-column">
              <h4>Attraction Drivers</h4>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                {workspace.market.attractionDrivers.map((driver) => (
                  <li key={driver}>{driver}</li>
                ))}
              </ul>
            </div>

            <div className="compare-column">
              <h4>Recommended Positioning</h4>
              <p style={{ marginTop: 0, lineHeight: 1.72 }}>
                {workspace.recommendations.summary}
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
                {workspace.recommendations.recommendations.map((recommendation) => (
                  <li key={recommendation}>{recommendation}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <aside className="glass-panel rightbar">
        <div className="card">
          <h3>What To Decide Here</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
            <li>Whether the promise is differentiated enough to sell.</li>
            <li>Which comparison titles help frame the pitch and which ones we must avoid echoing.</li>
            <li>What commercial wedge should carry into the outline and title work.</li>
          </ul>
        </div>

        <div className="card">
          <h3>Bridge to Outline</h3>
          <div className="recommendation">
            Once this feels sharp, the outline should reflect the market wedge. Chapter
            sequence should reinforce what makes the book distinct, not flatten it.
          </div>
        </div>
      </aside>
      </div>
    </div>
  );
}
