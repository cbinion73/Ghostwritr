import Link from "next/link";

import { commitAudienceStage } from "./actions";

import { STAGE_LINKS } from "@/lib/navigation";
import { getPromiseWorkspace } from "@/lib/workflows/promise";

export default async function AudienceStagePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getPromiseWorkspace(slug);
  const isCommitted = workspace.stage?.status === "COMMITTED";

  return (
    <div className="page-shell">
      <aside className="glass-panel sidebar">
        <div className="brand-mark">
          <h1>GHOSTWRITR</h1>
          <p className="muted">
            Study who the book is really for before we lock the structure.
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
              className={`stage-chip ${stage.key === "PROMISE" ? "active" : ""}`}
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
            <h2>Audience</h2>
            <div className="muted">
              Pressure-test the real readers, their pain patterns, and what would make
              this book feel made for them.
            </div>
          </div>

          <div className="button-row">
            <Link className="btn" href={`/books/${slug}/promise`}>
              Refine in Promise
            </Link>
            <Link className="btn" href={`/books/${slug}/market-analysis`}>
              Go to Market Analysis
            </Link>
            <form action={commitAudienceStage.bind(null, slug)}>
              <button className="btn btn-primary" type="submit">
                {isCommitted ? "Recommit Upstream Bundle" : "Commit Upstream Bundle"}
              </button>
            </form>
          </div>
        </section>

        <section className="workspace-grid outline-workspace-grid">
          <section className="glass-panel section-panel">
            <div className="section-header">
              <h3>Audience Lens</h3>
              <div className="muted">
                The promise and personas should point to a real buyer, not a blurry
                crowd.
              </div>
            </div>

            <div className="stack">
              <div className="card">
                <h4>Current Promise</h4>
                <p style={{ margin: 0, lineHeight: 1.72 }}>
                  {workspace.promiseBrief.promiseStatement}
                </p>
              </div>

              <div className="card">
                <h4>Primary Reader</h4>
                <div className="pill-row">
                  <div className="pill">{workspace.promiseBrief.audiencePrimary}</div>
                  {workspace.promiseBrief.audienceSecondary.map((audience) => (
                    <div className="pill" key={audience}>
                      {audience}
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <h4>Reader Tension</h4>
                <p style={{ margin: 0, lineHeight: 1.72 }}>
                  <strong>Problem:</strong> {workspace.promiseBrief.readerProblem}
                </p>
                <p style={{ margin: "10px 0 0", lineHeight: 1.72 }}>
                  <strong>Desired outcome:</strong> {workspace.promiseBrief.readerDesire}
                </p>
              </div>
            </div>
          </section>

          <section className="glass-panel section-panel paper-wrap">
            <article className="paper audience-paper">
              <div className="toc-kicker">Reader Personas</div>
              <h3>Audience Fit</h3>
              <div className="persona-grid">
                {workspace.personas.personas.map((persona) => (
                  <section className="persona-card" key={persona.id}>
                    <div className="persona-header">
                      <div>
                        <div className="persona-name">{persona.name}</div>
                        <div className="muted">{persona.context}</div>
                      </div>
                      <div className="pill">{persona.priority}</div>
                    </div>

                    <div className="persona-block">
                      <strong>Pain Points</strong>
                      <ul>
                        {persona.painPoints.map((point) => (
                          <li key={point}>{point}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="persona-block">
                      <strong>Desired Outcomes</strong>
                      <ul>
                        {persona.desiredOutcomes.map((outcome) => (
                          <li key={outcome}>{outcome}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="persona-block">
                      <strong>Buying Motivations</strong>
                      <ul>
                        {persona.buyingMotivations.map((motivation) => (
                          <li key={motivation}>{motivation}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="persona-block">
                      <strong>Language Cues</strong>
                      <div className="pill-row" style={{ marginTop: 10 }}>
                        {persona.languageCues.map((cue) => (
                          <div className="pill" key={cue}>
                            {cue}
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            </article>
          </section>
        </section>
      </main>

      <aside className="glass-panel rightbar">
        <div className="card">
          <h3>Audience Questions</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
            {workspace.promiseBrief.openQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h3>What To Decide Here</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
            <li>Who is the primary buyer and reader.</li>
            <li>Which secondary readers matter enough to influence the book.</li>
            <li>What language and examples will make the book feel native to them.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
