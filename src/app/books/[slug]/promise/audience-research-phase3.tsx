"use client";

import { useState } from "react";
import type {
  PersonaDeepProfile,
  PersonaComparisonAnalysis,
} from "@/lib/promise-types";

interface AudienceResearchPhase3Props {
  slug: string;
  data: PersonaComparisonAnalysis | null;
  personas: PersonaDeepProfile[] | null;
  isGenerating: boolean;
  onGenerate: () => void;
  onUpdate: (data: PersonaComparisonAnalysis) => void;
  onPrevious: () => void;
}

export default function AudienceResearchPhase3({
  slug,
  data,
  personas,
  isGenerating,
  onGenerate,
  onUpdate,
  onPrevious,
}: AudienceResearchPhase3Props) {
  const [editingField, setEditingField] = useState<string | null>(null);

  const handleUpdateField = (field: string, value: any) => {
    if (!data) return;
    onUpdate({
      ...data,
      [field]: value,
    });
  };

  const styles = {
    section: {
      display: "grid",
      gap: "24px",
    } as const,
    header: {
      display: "grid",
      gap: "12px",
    } as const,
    heading: {
      fontSize: "16px",
      fontWeight: 700,
      color: "#2d241d",
      margin: 0,
    } as const,
    description: {
      fontSize: "13px",
      color: "#6f6256",
      margin: 0,
    } as const,
    button: {
      padding: "10px 16px",
      backgroundColor: "#16384f",
      color: "white",
      border: "none",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: 600,
      cursor: "pointer",
    } as const,
    buttonDisabled: {
      opacity: 0.5,
      cursor: "not-allowed",
    } as const,
    buttonSecondary: {
      padding: "10px 16px",
      backgroundColor: "transparent",
      color: "#16384f",
      border: "1px solid rgba(59, 44, 31, 0.2)",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: 600,
      cursor: "pointer",
    } as const,
    subsection: {
      display: "grid",
      gap: "12px",
    } as const,
    card: {
      padding: "16px",
      backgroundColor: "rgba(255, 255, 255, 0.6)",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      borderRadius: "8px",
    } as const,
    label: {
      fontSize: "12px",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      color: "#6f6256",
    } as const,
    textarea: {
      width: "100%",
      padding: "10px 12px",
      fontSize: "13px",
      border: "1px solid rgba(59, 44, 31, 0.2)",
      borderRadius: "6px",
      fontFamily: "inherit",
      minHeight: "80px",
      resize: "vertical" as const,
    } as const,
    text: {
      fontSize: "13px",
      color: "#2d241d",
      margin: 0,
      lineHeight: "1.5",
    } as const,
    table: {
      width: "100%",
      borderCollapse: "collapse" as const,
      fontSize: "13px",
    } as const,
    tableHeader: {
      backgroundColor: "rgba(59, 44, 31, 0.06)",
      fontWeight: 700,
      padding: "12px",
      textAlign: "left" as const,
      borderBottom: "2px solid rgba(59, 44, 31, 0.12)",
    } as const,
    tableCell: {
      padding: "12px",
      borderBottom: "1px solid rgba(59, 44, 31, 0.12)",
    } as const,
    primaryPersonaBadge: {
      display: "inline-block",
      padding: "4px 8px",
      backgroundColor: "#dcfce7",
      color: "#166534",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: 600,
      marginTop: "8px",
    } as const,
    itemList: {
      display: "grid",
      gap: "8px",
      marginTop: "8px",
    } as const,
    listItem: {
      fontSize: "13px",
      color: "#2d241d",
      paddingLeft: "16px",
      position: "relative" as const,
    } as const,
    controls: {
      display: "grid",
      gap: "12px",
      gridAutoFlow: "column" as const,
      justifyContent: "space-between",
    } as const,
    buttonGroup: {
      display: "grid",
      gap: "12px",
      gridAutoFlow: "column" as const,
    } as const,
  };

  return (
    <div style={styles.section}>
      {/* Header */}
      <div style={styles.header}>
        <h3 style={styles.heading}>Persona Comparison & Analysis</h3>
        <p style={styles.description}>
          Cross-persona patterns, differences, and strategic priorities
        </p>
      </div>

      {/* Generate Button */}
      {!data && personas && personas.length > 0 && (
        <button
          style={{
            ...styles.button,
            ...(isGenerating ? styles.buttonDisabled : {}),
          }}
          onClick={onGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? "Generating Analysis..." : "Generate Comparison & Analysis"}
        </button>
      )}

      {/* Analysis Display */}
      {data && (
        <>
          {/* Common Themes */}
          <div style={styles.subsection}>
            <h4 style={styles.heading}>Common Themes</h4>
            <p style={styles.description}>
              What appears across all personas—your core book promise must address these
            </p>
            <div style={styles.card}>
              {editingField === "commonThemes" ? (
                <div style={{ display: "grid", gap: "8px" }}>
                  {data.commonThemes.map((theme, idx) => (
                    <textarea
                      key={idx}
                      style={{ ...styles.textarea, minHeight: "60px" }}
                      value={theme}
                      onChange={(e) => {
                        const newThemes = [...data.commonThemes];
                        newThemes[idx] = e.target.value;
                        handleUpdateField("commonThemes", newThemes);
                      }}
                    />
                  ))}
                  <button
                    style={styles.buttonSecondary}
                    onClick={() => setEditingField(null)}
                  >
                    Done Editing
                  </button>
                </div>
              ) : (
                <>
                  <ul style={styles.itemList}>
                    {data.commonThemes.map((theme, idx) => (
                      <li key={idx} style={styles.listItem}>
                        {theme}
                      </li>
                    ))}
                  </ul>
                  <button
                    style={styles.buttonSecondary}
                    onClick={() => setEditingField("commonThemes")}
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Primary Persona */}
          <div style={styles.subsection}>
            <h4 style={styles.heading}>Primary Persona</h4>
            <p style={styles.description}>
              The most urgent market opportunity—most pain, biggest market, easiest to reach
            </p>
            <div style={styles.card}>
              <p style={{ ...styles.heading, marginTop: 0 }}>
                {data.primaryPersona.name}
              </p>
              {editingField === "primaryPersona" ? (
                <>
                  <textarea
                    style={styles.textarea}
                    value={data.primaryPersona.reasoning}
                    onChange={(e) =>
                      handleUpdateField("primaryPersona", {
                        ...data.primaryPersona,
                        reasoning: e.target.value,
                      })
                    }
                    placeholder="Why is this the primary persona?"
                  />
                  <button
                    style={styles.buttonSecondary}
                    onClick={() => setEditingField(null)}
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <p style={styles.text}>{data.primaryPersona.reasoning}</p>
                  <button
                    style={styles.buttonSecondary}
                    onClick={() => setEditingField("primaryPersona")}
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Differences */}
          <div style={styles.subsection}>
            <h4 style={styles.heading}>Key Differences</h4>
            <p style={styles.description}>
              What makes each persona distinct—where voice blend emphasis matters most
            </p>
            <div style={styles.card}>
              {editingField === "differences" ? (
                <div style={{ display: "grid", gap: "12px" }}>
                  {data.differences.map((diff, idx) => (
                    <div key={idx} style={{ display: "grid", gap: "6px" }}>
                      <label style={styles.label}>{diff.persona}</label>
                      <textarea
                        style={styles.textarea}
                        value={diff.difference}
                        onChange={(e) => {
                          const newDifferences = [...data.differences];
                          newDifferences[idx] = {
                            ...diff,
                            difference: e.target.value,
                          };
                          handleUpdateField("differences", newDifferences);
                        }}
                      />
                    </div>
                  ))}
                  <button
                    style={styles.buttonSecondary}
                    onClick={() => setEditingField(null)}
                  >
                    Done Editing
                  </button>
                </div>
              ) : (
                <>
                  {data.differences.map((diff, idx) => (
                    <div key={idx} style={{ marginBottom: "12px" }}>
                      <p style={{ ...styles.label, marginBottom: "4px" }}>
                        {diff.persona}
                      </p>
                      <p style={styles.text}>{diff.difference}</p>
                    </div>
                  ))}
                  <button
                    style={styles.buttonSecondary}
                    onClick={() => setEditingField("differences")}
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Comparison Matrix */}
          <div style={styles.subsection}>
            <h4 style={styles.heading}>Comparison Matrix</h4>
            <p style={styles.description}>
              Side-by-side view of how personas differ across key dimensions
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.tableHeader}>Dimension</th>
                    {personas?.map((persona) => (
                      <th key={persona.id} style={styles.tableHeader}>
                        {persona.name}
                        {persona.id === data.primaryPersona.name && (
                          <span style={styles.primaryPersonaBadge}>Primary</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.comparisonMatrix.map((row, idx) => (
                    <tr key={idx}>
                      <td style={styles.tableCell}>
                        <strong>{row.dimension}</strong>
                      </td>
                      {row.personas.map((cell, cellIdx) => (
                        <td key={cellIdx} style={styles.tableCell}>
                          {cell.value}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Navigation */}
          <div style={styles.controls}>
            <button style={styles.button} onClick={onPrevious}>
              ← Previous Phase
            </button>
            <div style={styles.buttonGroup}>
              <button
                style={{
                  ...styles.button,
                  ...(isGenerating ? styles.buttonDisabled : {}),
                }}
                onClick={onGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? "Regenerating..." : "Regenerate Analysis"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
