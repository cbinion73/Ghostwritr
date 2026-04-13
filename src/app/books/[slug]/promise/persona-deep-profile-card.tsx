"use client";

import { useState } from "react";
import type { PersonaDeepProfile } from "@/lib/promise-types";

interface PersonaDeepProfileCardProps {
  persona: PersonaDeepProfile;
  onUpdate: (persona: PersonaDeepProfile) => void;
}

export default function PersonaDeepProfileCard({
  persona,
  onUpdate,
}: PersonaDeepProfileCardProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([
    "demographics",
    "currentSituation",
  ]);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  };

  const handleUpdate = (field: string, value: any) => {
    onUpdate({
      ...persona,
      [field]: value,
    });
  };

  const styles = {
    container: {
      display: "grid",
      gap: "16px",
    } as const,
    header: {
      display: "grid",
      gap: "8px",
      paddingBottom: "16px",
      borderBottom: "1px solid rgba(59, 44, 31, 0.12)",
    } as const,
    name: {
      fontSize: "18px",
      fontWeight: 700,
      color: "#2d241d",
      margin: 0,
    } as const,
    role: {
      fontSize: "13px",
      color: "#6f6256",
      margin: 0,
    } as const,
    section: {
      display: "grid",
      gap: "12px",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      borderRadius: "8px",
      overflow: "hidden",
    } as const,
    sectionHeader: {
      padding: "12px",
      backgroundColor: "rgba(59, 44, 31, 0.04)",
      cursor: "pointer",
      display: "grid",
      gridAutoFlow: "column" as const,
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px",
    } as const,
    sectionTitle: {
      fontSize: "13px",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      color: "#6f6256",
      margin: 0,
    } as const,
    sectionContent: {
      padding: "12px",
      display: "grid",
      gap: "12px",
    } as const,
    field: {
      display: "grid",
      gap: "6px",
    } as const,
    label: {
      fontSize: "11px",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      color: "#6f6256",
    } as const,
    input: {
      width: "100%",
      padding: "8px 10px",
      fontSize: "13px",
      border: "1px solid rgba(59, 44, 31, 0.2)",
      borderRadius: "4px",
      fontFamily: "inherit",
    } as const,
    textarea: {
      width: "100%",
      padding: "8px 10px",
      fontSize: "13px",
      border: "1px solid rgba(59, 44, 31, 0.2)",
      borderRadius: "4px",
      fontFamily: "inherit",
      minHeight: "60px",
      resize: "vertical" as const,
    } as const,
    text: {
      fontSize: "13px",
      color: "#2d241d",
      margin: 0,
    } as const,
    itemList: {
      display: "grid",
      gap: "8px",
    } as const,
    item: {
      display: "grid",
      gap: "6px",
      padding: "8px",
      backgroundColor: "rgba(255, 255, 255, 0.5)",
      borderRadius: "4px",
      fontSize: "12px",
    } as const,
    removeButton: {
      padding: "2px 6px",
      fontSize: "10px",
      border: "1px solid #ccc",
      background: "transparent",
      borderRadius: "2px",
      cursor: "pointer",
      color: "#666",
    } as const,
  };

  const sections: any[] = [
    {
      id: "demographics",
      title: "Demographics & Context",
      fields: [
        { key: "role", label: "Role" },
        { key: "companyType", label: "Company Type" },
        { key: "yearsInRole", label: "Years in Role", type: "number" },
        { key: "careerPath", label: "Career Path" },
        { key: "dayInTheLife", label: "Day in the Life" },
        { key: "reportsTo", label: "Reports To" },
        { key: "teamSize", label: "Team Size", type: "number" },
      ],
      data: persona.demographics,
    },
    {
      id: "currentSituation",
      title: "Current Situation",
      fields: [
        { key: "whatTheyDo", label: "What They Do" },
        { key: "whatWorks", label: "What Works", type: "array" },
        { key: "whatDoesntWork", label: "What Doesn't Work", type: "array" },
        { key: "timeAllocation", label: "Time Allocation" },
        { key: "biggestFrustration", label: "Biggest Frustration" },
      ],
      data: persona.currentSituation,
    },
    {
      id: "goals",
      title: "Goals",
      items: persona.goals,
      itemFields: [
        { key: "goal", label: "Goal" },
        {
          key: "type",
          label: "Type",
          options: ["outcome", "feeling"],
        },
      ],
    },
    {
      id: "painPoints",
      title: "Pain Points",
      items: persona.painPoints,
      itemFields: [
        { key: "friction", label: "Friction" },
        { key: "realCost", label: "Real Cost" },
      ],
    },
    {
      id: "objections",
      title: "Objections",
      items: persona.objections,
      itemFields: [
        { key: "objection", label: "Objection" },
        { key: "proofNeeded", label: "Proof Needed" },
      ],
    },
    {
      id: "successMetrics",
      title: "Success Metrics",
      items: persona.successMetrics,
      itemFields: [
        { key: "metric", label: "Metric" },
        { key: "feeling", label: "Feeling (optional)" },
      ],
    },
    {
      id: "learningStyle",
      title: "Learning Style",
      fields: [
        { key: "prefers", label: "Prefers", type: "array" },
        { key: "hates", label: "Hates", type: "array" },
        { key: "bestFormat", label: "Best Format" },
      ],
      data: persona.learningStyle,
    },
    {
      id: "voiceBlendFit",
      title: "Voice Blend Fit",
      fields: [
        { key: "primary", label: "Primary" },
        { key: "secondary", label: "Secondary (optional)" },
        { key: "tertiary", label: "Tertiary (optional)" },
        { key: "reasoning", label: "Reasoning" },
      ],
      data: persona.voiceBlendFit,
    },
  ];

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <input
          type="text"
          style={{ ...styles.input, fontSize: "16px", fontWeight: 700 }}
          value={persona.name}
          onChange={(e) => handleUpdate("name", e.target.value)}
          placeholder="Persona Name"
        />
        <div style={{ display: "grid", gap: "8px", gridAutoFlow: "column", justifyContent: "flex-start" }}>
          <label style={styles.label}>Priority</label>
          <select
            style={styles.input}
            value={persona.priority || "secondary"}
            onChange={(e) =>
              handleUpdate(
                "priority",
                e.target.value as "primary" | "secondary"
              )
            }
          >
            <option value="primary">🎯 Primary</option>
            <option value="secondary">◐ Secondary</option>
          </select>
        </div>
      </div>

      {/* Sections */}
      {sections.map((section) => (
        <div key={section.id} style={styles.section}>
          <div
            style={styles.sectionHeader}
            onClick={() => toggleSection(section.id)}
          >
            <p style={styles.sectionTitle}>{section.title}</p>
            <span style={{ fontSize: "16px" }}>
              {expandedSections.includes(section.id) ? "▼" : "▶"}
            </span>
          </div>

          {expandedSections.includes(section.id) && (
            <div style={styles.sectionContent}>
              {"fields" in section && Array.isArray(section.fields) ? (
                // Regular fields section
                <div style={styles.itemList}>
                  {section.fields.map((field: any) => {
                    const sectionData = section.data as Record<string, unknown> | undefined;
                    const value = sectionData?.[field.key] ?? "";
                    const fieldValue =
                      typeof value === "string" || typeof value === "number" ? value : "";
                    if (field.type === "array") {
                      return (
                        <div key={field.key} style={styles.field}>
                          <label style={styles.label}>{field.label}</label>
                          <div style={styles.itemList}>
                            {Array.isArray(value) &&
                              value.map((item: string, idx: number) => (
                                <input
                                  key={idx}
                                  style={styles.input}
                                  value={item}
                                  onChange={(e) => {
                                    const newArray = [...value];
                                    newArray[idx] = e.target.value;
                                    handleUpdate(field.key, newArray);
                                  }}
                                  placeholder={`${field.label} ${idx + 1}`}
                                />
                              ))}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={field.key} style={styles.field}>
                        <label style={styles.label}>{field.label}</label>
                        {field.type === "number" ? (
                          <input
                            type="number"
                            style={styles.input}
                            value={fieldValue}
                            onChange={(e) =>
                              handleUpdate(field.key, parseInt(e.target.value) || 0)
                            }
                          />
                        ) : (
                          <textarea
                            style={styles.textarea}
                            value={fieldValue}
                            onChange={(e) => handleUpdate(field.key, e.target.value)}
                            placeholder={field.label}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Items section (goals, pain points, objections, etc.)
                <div style={styles.itemList}>
                  {("items" in section &&
                    Array.isArray(section.items) &&
                    section.items.map((item: any, idx: number) => (
                      <div key={idx} style={styles.item}>
                        {section.itemFields?.map((field: any) => (
                          <div key={field.key} style={styles.field}>
                            <label style={styles.label}>{field.label}</label>
                            {field.options ? (
                              <select
                                style={styles.input}
                                value={item[field.key] || ""}
                                onChange={(e) => {
                                  const newItems = [...(section as any).items];
                                  newItems[idx] = {
                                    ...item,
                                    [field.key]: e.target.value,
                                  };
                                  handleUpdate(section.id, newItems);
                                }}
                              >
                                {field.options.map((opt: string) => (
                                  <option key={opt} value={opt}>
                                    {opt}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <textarea
                                style={styles.textarea}
                                value={item[field.key] || ""}
                                onChange={(e) => {
                                  const newItems = [...(section as any).items];
                                  newItems[idx] = {
                                    ...item,
                                    [field.key]: e.target.value,
                                  };
                                  handleUpdate(section.id, newItems);
                                }}
                                placeholder={field.label}
                              />
                            )}
                          </div>
                        ))}
                        <button
                          style={styles.removeButton}
                          onClick={() => {
                            const newItems = (section as any).items.filter(
                              (_: any, i: number) => i !== idx
                            );
                            handleUpdate(section.id, newItems);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    ))) ||
                    null}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
