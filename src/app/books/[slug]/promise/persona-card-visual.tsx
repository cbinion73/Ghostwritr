"use client";

interface PersonaCardVisualProps {
  name: string;
  priority: "primary" | "secondary";
  context: string;
  painPoints: string[];
  desiredOutcomes: string[];
  buyingMotivations?: string[];
  languageCues?: string[];
}

export function PersonaCardVisual({
  name,
  priority,
  context,
  painPoints,
  desiredOutcomes,
  buyingMotivations = [],
  languageCues = [],
}: PersonaCardVisualProps) {
  // Generate avatar initials and color
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const colors = [
    "#16384f", // Navy
    "#16a34a", // Green
    "#ea580c", // Orange
    "#8b5cf6", // Purple
    "#06b6d4", // Cyan
  ];
  const colorIndex = name.charCodeAt(0) % colors.length;
  const bgColor = colors[colorIndex];

  return (
    <div style={styles.card}>
      {/* Header with Avatar and Name */}
      <div style={styles.header}>
        <div
          style={{
            ...styles.avatar,
            backgroundColor: bgColor,
          }}
        >
          <span style={styles.initials}>{initials}</span>
        </div>
        <div style={styles.nameSection}>
          <h3 style={styles.name}>{name}</h3>
          <div
            style={{
              ...styles.priorityBadge,
              ...(priority === "primary"
                ? styles.priorityBadgePrimary
                : styles.priorityBadgeSecondary),
            }}
          >
            {priority === "primary" ? "🎯 Primary" : "◐ Secondary"}
          </div>
        </div>
      </div>

      {/* Context */}
      <p style={styles.context}>{context}</p>

      {/* Pain Points */}
      {painPoints.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>🔴 Pain Points</h4>
          <div style={styles.badgesContainer}>
            {painPoints.map((point, i) => (
              <span key={i} style={styles.painPointBadge}>
                {point}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Desired Outcomes */}
      {desiredOutcomes.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>✨ Desired Outcomes</h4>
          <div style={styles.badgesContainer}>
            {desiredOutcomes.map((outcome, i) => (
              <span key={i} style={styles.outcomeBadge}>
                {outcome}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Buying Motivations */}
      {buyingMotivations.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>💰 Buying Motivations</h4>
          <div style={styles.badgesContainer}>
            {buyingMotivations.map((motivation, i) => (
              <span key={i} style={styles.motivationBadge}>
                {motivation}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Language Cues */}
      {languageCues.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>🗣️ Language Cues</h4>
          <p style={styles.cuesText}>{languageCues.join(" • ")}</p>
        </div>
      )}
    </div>
  );
}

const styles = {
  card: {
    padding: "20px",
    backgroundColor: "#fff",
    border: "1px solid rgba(45, 36, 29, 0.15)",
    borderRadius: "12px",
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "16px",
    transition: "all 0.2s",
  },
  header: {
    display: "flex" as const,
    gap: "16px",
    alignItems: "flex-start",
  },
  avatar: {
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    display: "flex" as const,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  initials: {
    color: "white",
    fontSize: "18px",
    fontWeight: 700,
  },
  nameSection: {
    flex: 1,
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "6px",
  },
  name: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 600,
    color: "#2d241d",
  },
  priorityBadge: {
    display: "inline-flex" as const,
    width: "fit-content",
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "11px",
    fontWeight: 600,
  },
  priorityBadgePrimary: {
    backgroundColor: "#dbeafe",
    color: "#0c4a6e",
  },
  priorityBadgeSecondary: {
    backgroundColor: "#e5e7eb",
    color: "#374151",
  },
  context: {
    margin: 0,
    fontSize: "13px",
    color: "#6f6256",
    lineHeight: 1.6,
    fontStyle: "italic",
  },
  section: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "10px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "12px",
    fontWeight: 600,
    color: "#2d241d",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
  },
  badgesContainer: {
    display: "flex" as const,
    flexWrap: "wrap" as const,
    gap: "8px",
  },
  painPointBadge: {
    display: "inline-flex" as const,
    padding: "6px 12px",
    backgroundColor: "#fee2e2",
    color: "#991b1b",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
  },
  outcomeBadge: {
    display: "inline-flex" as const,
    padding: "6px 12px",
    backgroundColor: "#dcfce7",
    color: "#166534",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
  },
  motivationBadge: {
    display: "inline-flex" as const,
    padding: "6px 12px",
    backgroundColor: "#fef3c7",
    color: "#92400e",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
  },
  cuesText: {
    margin: 0,
    fontSize: "13px",
    color: "#6f6256",
    lineHeight: 1.6,
  },
};
