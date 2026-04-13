"use client";

interface HeroJourneyStage {
  stage: number;
  name: string;
  description: string;
}

interface TransformationArcDiagramProps {
  before: string;
  after: string;
  stages?: HeroJourneyStage[];
}

export function TransformationArcDiagram({
  before,
  after,
  stages = defaultStages,
}: TransformationArcDiagramProps) {
  return (
    <div style={styles.container}>
      {/* Before and After Summary */}
      <div style={styles.beforeAfterSummary}>
        <div style={styles.beforeSection}>
          <div style={styles.statusLabel}>BEFORE</div>
          <p style={styles.statusText}>{before}</p>
        </div>

        <div style={styles.arrow}>
          <svg width="60" height="40" viewBox="0 0 60 40">
            <defs>
              <marker
                id="arrowhead"
                markerWidth="10"
                markerHeight="10"
                refX="9"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 10 3, 0 6" fill="#16384f" />
              </marker>
            </defs>
            <line
              x1="10"
              y1="20"
              x2="50"
              y2="20"
              stroke="#16384f"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
          </svg>
        </div>

        <div style={styles.afterSection}>
          <div style={styles.statusLabel}>AFTER</div>
          <p style={styles.statusText}>{after}</p>
        </div>
      </div>

      {/* Hero Journey Stages */}
      <div style={styles.stagesContainer}>
        <h4 style={styles.stagesTitle}>Hero Journey: 7-Stage Arc</h4>

        <div style={styles.stagesList}>
          {stages.map((stage) => (
            <div key={stage.stage} style={styles.stageItem}>
              {/* Stage Node */}
              <div
                style={{
                  ...styles.stageNode,
                  backgroundColor: getStageColor(stage.stage),
                }}
              >
                <div style={styles.stageNumber}>{stage.stage}</div>
              </div>

              {/* Stage Content */}
              <div style={styles.stageContent}>
                <h5 style={styles.stageName}>{stage.name}</h5>
                <p style={styles.stageDescription}>{stage.description}</p>
              </div>

              {/* Connector Line (except for last stage) */}
              {stage.stage < stages.length && (
                <div style={styles.connector}>
                  <svg width="2" height="40" viewBox="0 0 2 40">
                    <line
                      x1="1"
                      y1="0"
                      x2="1"
                      y2="40"
                      stroke="#d1d5db"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={styles.legend}>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendDot, backgroundColor: "#fef3c7" }} />
          <span>1-2: Inciting Incident</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendDot, backgroundColor: "#fed7aa" }} />
          <span>3-5: Confrontation & Challenge</span>
        </div>
        <div style={styles.legendItem}>
          <div style={{ ...styles.legendDot, backgroundColor: "#dcfce7" }} />
          <span>6-7: Transformation & Return</span>
        </div>
      </div>
    </div>
  );
}

function getStageColor(stageNum: number): string {
  if (stageNum <= 2) return "#fef3c7"; // Yellow for setup
  if (stageNum <= 5) return "#fed7aa"; // Orange for challenge
  return "#dcfce7"; // Green for resolution
}

const defaultStages: HeroJourneyStage[] = [
  {
    stage: 1,
    name: "Ordinary World",
    description: "The hero's normal life before the call to adventure",
  },
  {
    stage: 2,
    name: "Call to Adventure",
    description: "The event that starts the journey and demands change",
  },
  {
    stage: 3,
    name: "Refusal of the Call",
    description: "Initial hesitation or fear to accept the challenge",
  },
  {
    stage: 4,
    name: "Meeting with Mentor",
    description: "Guidance and resources to begin the transformation",
  },
  {
    stage: 5,
    name: "Crossing the Threshold",
    description: "Committing fully to the change process",
  },
  {
    stage: 6,
    name: "Tests & Allies",
    description: "Learning new skills and discovering inner strength",
  },
  {
    stage: 7,
    name: "Return with the Elixir",
    description: "Transformed and ready to apply learnings to real life",
  },
];

const styles = {
  container: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "32px",
  },
  beforeAfterSummary: {
    display: "grid" as const,
    gridTemplateColumns: "1fr auto 1fr",
    gap: "20px",
    alignItems: "center",
    padding: "24px",
    backgroundColor: "rgba(22, 163, 74, 0.05)",
    borderRadius: "12px",
    border: "1px solid rgba(22, 163, 74, 0.2)",
  },
  beforeSection: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "8px",
  },
  afterSection: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "8px",
  },
  statusLabel: {
    fontSize: "11px",
    fontWeight: 700,
    color: "#6f6256",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  statusText: {
    margin: 0,
    fontSize: "14px",
    fontWeight: 600,
    color: "#2d241d",
    lineHeight: 1.6,
  },
  arrow: {
    display: "flex" as const,
    alignItems: "center",
    justifyContent: "center",
  },
  stagesContainer: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "16px",
  },
  stagesTitle: {
    margin: "0 0 16px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#2d241d",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  stagesList: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "12px",
    paddingLeft: "20px",
    position: "relative" as const,
  },
  stageItem: {
    display: "grid" as const,
    gridTemplateColumns: "60px 1fr",
    gap: "12px",
    alignItems: "start",
    position: "relative" as const,
  },
  stageNode: {
    width: "60px",
    height: "60px",
    borderRadius: "50%",
    display: "flex" as const,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    border: "2px solid white",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  },
  stageNumber: {
    fontSize: "24px",
    fontWeight: 700,
    color: "#2d241d",
  },
  stageContent: {
    paddingTop: "6px",
  },
  stageName: {
    margin: "0 0 4px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#2d241d",
  },
  stageDescription: {
    margin: 0,
    fontSize: "12px",
    color: "#6f6256",
    lineHeight: 1.5,
  },
  connector: {
    position: "absolute" as const,
    left: "29px",
    top: "60px",
    width: "2px",
    height: "40px",
  },
  legend: {
    display: "flex" as const,
    gap: "24px",
    padding: "16px",
    backgroundColor: "rgba(45, 36, 29, 0.03)",
    borderRadius: "8px",
    flexWrap: "wrap" as const,
  },
  legendItem: {
    display: "flex" as const,
    alignItems: "center",
    gap: "8px",
    fontSize: "12px",
    color: "#6f6256",
  },
  legendDot: {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
  },
};
