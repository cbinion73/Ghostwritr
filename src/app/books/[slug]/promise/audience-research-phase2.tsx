"use client";

import { useState } from "react";
import type { AudienceResearchPhase1, PersonaDeepProfile } from "@/lib/promise-types";
import PersonaDeepProfileCard from "./persona-deep-profile-card";

interface AudienceResearchPhase2Props {
  slug: string;
  data: PersonaDeepProfile[] | null;
  phase1Data: AudienceResearchPhase1 | null;
  isGenerating: boolean;
  onGenerate: (numPersonas: number) => void;
  onUpdate: (personas: PersonaDeepProfile[]) => void;
  onNext: () => void;
  onPrevious: () => void;
}

export default function AudienceResearchPhase2({
  slug,
  data,
  phase1Data,
  isGenerating,
  onGenerate,
  onUpdate,
  onNext,
  onPrevious,
}: AudienceResearchPhase2Props) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [numPersonas, setNumPersonas] = useState(5);

  const selectedPersona =
    selectedPersonaId && data ? data.find((p) => p.id === selectedPersonaId) : null;

  const handleUpdatePersona = (updated: PersonaDeepProfile) => {
    if (!data) return;
    const newData = data.map((p) => (p.id === updated.id ? updated : p));
    onUpdate(newData);
  };

  const handleDeletePersona = (id: string) => {
    if (!data) return;
    onUpdate(data.filter((p) => p.id !== id));
    setSelectedPersonaId(null);
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
    controls: {
      display: "grid",
      gap: "12px",
      gridAutoFlow: "column" as const,
      justifyContent: "space-between",
      alignItems: "center",
    } as const,
    numPersonasControl: {
      display: "grid",
      gap: "8px",
      gridAutoFlow: "column" as const,
      alignItems: "center",
      justifyContent: "flex-start",
    } as const,
    label: {
      fontSize: "12px",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      color: "#6f6256",
    } as const,
    input: {
      padding: "6px 10px",
      fontSize: "14px",
      border: "1px solid rgba(59, 44, 31, 0.2)",
      borderRadius: "4px",
      width: "60px",
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
      transition: "opacity 0.2s",
    } as const,
    buttonDisabled: {
      opacity: 0.5,
      cursor: "not-allowed",
    } as const,
    container: {
      display: selectedPersona ? "grid" : "block",
      gap: selectedPersona ? "24px" : "0",
      gridTemplateColumns: selectedPersona ? "1fr 2fr" : undefined,
    } as const,
    personaGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: "16px",
    } as const,
    personaCard: {
      padding: "16px",
      backgroundColor: "rgba(255, 255, 255, 0.6)",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      borderRadius: "8px",
      cursor: "pointer",
      transition: "all 0.2s",
    } as const,
    personaCardActive: {
      backgroundColor: "#16384f",
      color: "white",
      border: "1px solid #16384f",
    } as const,
    personaCardName: {
      fontSize: "14px",
      fontWeight: 700,
      margin: "0 0 8px 0",
    } as const,
    personaCardRole: {
      fontSize: "12px",
      opacity: 0.8,
      margin: 0,
    } as const,
    personaCardActions: {
      display: "grid",
      gap: "8px",
      gridAutoFlow: "column" as const,
      justifyContent: "flex-end",
      marginTop: "12px",
      paddingTop: "12px",
      borderTop: "1px solid rgba(0, 0, 0, 0.1)",
    } as const,
    smallButton: {
      padding: "4px 8px",
      fontSize: "11px",
      border: "1px solid currentColor",
      background: "transparent",
      borderRadius: "4px",
      cursor: "pointer",
      color: "inherit",
      fontWeight: 500,
    } as const,
    emptyState: {
      padding: "32px 24px",
      textAlign: "center" as const,
      color: "#6f6256",
      fontSize: "14px",
    } as const,
    detailPanel: {
      display: "grid",
      gap: "16px",
      padding: "16px",
      backgroundColor: "rgba(255, 255, 255, 0.6)",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      borderRadius: "8px",
      maxHeight: "80vh",
      overflowY: "auto" as const,
    } as const,
    navigationButtons: {
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
        <h3 style={styles.heading}>Reader Personas (Deep Profiles)</h3>
        <p style={styles.description}>
          Detailed personas with 8 comprehensive sections each. Click to view/edit details.
        </p>
      </div>

      {/* Generate Button */}
      {!data && (
        <div style={styles.controls}>
          <div style={styles.numPersonasControl}>
            <label style={styles.label}>Generate</label>
            <input
              style={styles.input}
              type="number"
              min="1"
              max="10"
              value={numPersonas}
              onChange={(e) => setNumPersonas(parseInt(e.target.value) || 5)}
              disabled={isGenerating}
            />
            <span style={styles.description}>personas</span>
          </div>
          <button
            style={{
              ...styles.button,
              ...(isGenerating ? styles.buttonDisabled : {}),
            }}
            onClick={() => onGenerate(numPersonas)}
            disabled={isGenerating}
          >
            {isGenerating ? "Generating..." : "Generate Deep Personas"}
          </button>
        </div>
      )}

      {/* Personas Display */}
      {data && (
        <div style={styles.container}>
          {/* Personas List */}
          <div>
            <div style={styles.personaGrid}>
              {data.map((persona) => (
                <div
                  key={persona.id}
                  style={{
                    ...styles.personaCard,
                    ...(selectedPersona?.id === persona.id
                      ? styles.personaCardActive
                      : {}),
                  }}
                  onClick={() => setSelectedPersonaId(persona.id)}
                >
                  <p style={styles.personaCardName}>{persona.name}</p>
                  <p style={styles.personaCardRole}>
                    {persona.demographics.role}
                  </p>
                  {persona.priority && (
                    <p style={{ ...styles.description, marginTop: "8px" }}>
                      {persona.priority === "primary" ? "🎯 Primary" : "◐ Secondary"}
                    </p>
                  )}
                  <div style={styles.personaCardActions}>
                    <button
                      style={styles.smallButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePersona(persona.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {data.length === 0 && (
              <div style={styles.emptyState}>No personas generated yet</div>
            )}
          </div>

          {/* Detailed View */}
          {selectedPersona && (
            <div style={styles.detailPanel}>
              <PersonaDeepProfileCard
                persona={selectedPersona}
                onUpdate={handleUpdatePersona}
              />
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      {data && data.length > 0 && (
        <div style={styles.navigationButtons}>
          <button
            style={styles.button}
            onClick={onPrevious}
          >
            ← Previous Phase
          </button>
          <div style={styles.buttonGroup}>
            <button
              style={{
                ...styles.button,
                ...(isGenerating ? styles.buttonDisabled : {}),
              }}
              onClick={onNext}
              disabled={isGenerating}
            >
              Next: Comparison →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
