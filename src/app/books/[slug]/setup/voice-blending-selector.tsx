"use client";

import { useEffect, useState } from "react";
import {
  suggestWriterPersonas,
  saveWriterPersonaBlend,
  getAvailablePersonas,
  generateVoiceBlendPreview,
} from "./actions";
import type { WriterPersonaBlend } from "@/lib/book-setup-types";

interface SuggestedPersona {
  personaId: string;
  personaName: string;
  personaSlug: string;
  traits: string[];
  signaturePatterns: string[];
  reasoning: string;
  suggestedPercentage: number;
  confidence: "high" | "medium" | "low";
}

interface AvailablePersona {
  id: string;
  name: string;
  slug: string;
  description: string;
  voiceTraits: string[];
}

interface VoiceBlendingSelectorProps {
  slug: string;
  workingTitle: string;
  category: string;
  description: string;
  onBlendSelected: (blend: WriterPersonaBlend[]) => void;
  initialBlend?: WriterPersonaBlend[];
}

export function VoiceBlendingSelector({
  slug,
  workingTitle,
  category,
  description,
  onBlendSelected,
  initialBlend,
}: VoiceBlendingSelectorProps) {
  const [suggestions, setSuggestions] = useState<SuggestedPersona[]>([]);
  const [availablePersonas, setAvailablePersonas] = useState<AvailablePersona[]>([]);
  const [selectedPersonaForAdding, setSelectedPersonaForAdding] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [blendPreview, setBlendPreview] = useState<string | null>(null);
  const [isBlendLocked, setIsBlendLocked] = useState(!!initialBlend && initialBlend.length > 0);

  // Initialize with saved blend if available, otherwise load suggestions only on initial mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Always load available personas for the dropdown
        const personas = await getAvailablePersonas();
        setAvailablePersonas(personas);

        // Only load AI suggestions if no blend is locked in yet
        if (!isBlendLocked && workingTitle && category && description) {
          const suggestions = await suggestWriterPersonas(slug, workingTitle, category, description);
          setSuggestions(suggestions);
        }

        // If there's an initial blend, populate suggestions with it
        if (initialBlend && initialBlend.length > 0) {
          const initialSuggestions: SuggestedPersona[] = initialBlend.map((blend) => ({
            personaId: blend.personaId,
            personaName: blend.personaName,
            personaSlug: blend.personaSlug,
            traits: blend.traits,
            signaturePatterns: blend.signaturePatterns,
            reasoning: "Locked blend - saved configuration",
            suggestedPercentage: blend.percentInfluence,
            confidence: "high" as const,
          }));
          setSuggestions(initialSuggestions);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []); // Empty dependency array - only run on mount

  // Request new AI suggestions (manual)
  const requestNewSuggestions = async () => {
    if (!workingTitle || !category || !description) {
      setError("Book details required to generate recommendations");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const newSuggestions = await suggestWriterPersonas(slug, workingTitle, category, description);
      setSuggestions(newSuggestions);
      setBlendPreview(null); // Clear preview when new suggestions arrive
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate recommendations");
    } finally {
      setIsLoading(false);
    }
  };

  // Generate preview prose based on current slider values
  const generatePreview = async () => {
    if (suggestions.length === 0) return;

    const activePersonas = suggestions.filter((s) => s.suggestedPercentage > 0);
    if (activePersonas.length === 0) {
      setError("Select at least one persona to see a preview.");
      return;
    }

    setPreviewLoading(true);
    setError(null);
    try {
      // Call server action to generate prose in the blended voice
      const preview = await generateVoiceBlendPreview(
        workingTitle,
        activePersonas.map((p) => ({
          personaName: p.personaName,
          percentInfluence: p.suggestedPercentage,
          traits: p.traits,
          signaturePatterns: p.signaturePatterns,
        }))
      );

      setBlendPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle slider changes with auto-calculation of last slider
  const handleSuggestionSliderChange = (index: number, newValue: number) => {
    const updatedSuggestions = [...suggestions];
    updatedSuggestions[index].suggestedPercentage = Math.max(0, Math.min(100, newValue));

    // Auto-calculate the last slider to maintain 100% total
    if (index < suggestions.length - 1) {
      const sumExceptLast = updatedSuggestions
        .slice(0, -1)
        .reduce((sum, s) => sum + s.suggestedPercentage, 0);
      const lastIndex = updatedSuggestions.length - 1;
      updatedSuggestions[lastIndex].suggestedPercentage = Math.max(0, 100 - sumExceptLast);
    } else {
      // If we're changing the last one, recalculate the rest proportionally
      const sumOthers = updatedSuggestions
        .slice(0, -1)
        .reduce((sum, s) => sum + s.suggestedPercentage, 0);
      if (sumOthers > 100) {
        // Don't allow others to exceed 100, so cap this value
        updatedSuggestions[index].suggestedPercentage = Math.max(0, 100 - sumOthers);
      }
    }

    setSuggestions(updatedSuggestions);
    setBlendPreview(null); // Clear preview when sliders change
  };

  const addPersonaFromLibrary = () => {
    if (!selectedPersonaForAdding) {
      setError("Please select a persona to add");
      return;
    }

    // Check if persona is already in suggestions
    if (suggestions.some((s) => s.personaId === selectedPersonaForAdding)) {
      setError("This persona is already in your blend");
      return;
    }

    const availablePersona = availablePersonas.find((p) => p.id === selectedPersonaForAdding);
    if (!availablePersona) {
      setError("Persona not found");
      return;
    }

    const newPersona: SuggestedPersona = {
      personaId: availablePersona.id,
      personaName: availablePersona.name,
      personaSlug: availablePersona.slug,
      traits: availablePersona.voiceTraits,
      signaturePatterns: [],
      reasoning: "Added from library",
      suggestedPercentage: 0,
      confidence: "high" as const,
    };

    setSuggestions([...suggestions, newPersona]);
    setSelectedPersonaForAdding("");
    setError(null);
  };

  const removePersona = (personaId: string) => {
    setSuggestions(suggestions.filter((s) => s.personaId !== personaId));
    setBlendPreview(null);
  };

  const adoptBlend = async () => {
    // Convert suggestions to blend with non-zero percentages only
    const blend: WriterPersonaBlend[] = suggestions
      .filter((s) => s.suggestedPercentage > 0)
      .map((s) => ({
        personaId: s.personaId,
        personaName: s.personaName,
        personaSlug: s.personaSlug,
        percentInfluence: s.suggestedPercentage,
        traits: s.traits,
        signaturePatterns: s.signaturePatterns,
      }));

    if (blend.length === 0) {
      setError("At least one persona must have a percentage above 0%");
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await saveWriterPersonaBlend(slug, blend);
      setIsBlendLocked(true); // Lock the blend - no more auto-suggestions
      onBlendSelected(blend);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save voice blend");
    } finally {
      setIsSaving(false);
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "#16a34a";
      case "medium":
        return "#ea580c";
      case "low":
        return "#dc2626";
      default:
        return "#666";
    }
  };

  const suggestionsTotal = suggestions.reduce((sum, s) => sum + s.suggestedPercentage, 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={styles.title}>🎭 Voice Blending</h2>
            <p style={styles.subtitle}>
              Writers define your book's entire narrative arc. Blend multiple personas to craft your unique voice.
            </p>
            {isBlendLocked && (
              <p style={{ margin: "8px 0 0 0", fontSize: "12px", color: "#16a34a", fontWeight: 600 }}>
                ✓ Blend locked - Only you can change it now
              </p>
            )}
          </div>
          {isBlendLocked && (
            <button
              onClick={requestNewSuggestions}
              disabled={isLoading}
              style={{
                ...styles.button,
                ...styles.buttonPrimary,
                fontSize: "11px",
                padding: "6px 12px",
                opacity: isLoading ? 0.6 : 1,
                cursor: isLoading ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
              }}
              title="Ask AI for new persona recommendations"
            >
              {isLoading ? "Analyzing..." : "🔄 Get New Suggestions"}
            </button>
          )}
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Analysis is happening silently */}
      {isLoading && !isBlendLocked && <p style={styles.loading}>Analyzing your book and finding the best voices...</p>}

      {/* Fine-tune Voice Blend Section */}
      {suggestions.length > 0 && (
        <div
          style={{
            ...styles.section,
            backgroundColor: "rgba(22, 163, 74, 0.05)",
            padding: "16px",
            borderRadius: "6px",
            border: "1px solid rgba(22, 163, 74, 0.2)",
          }}
        >
              <h4 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: 600, color: "#2d241d" }}>
                🎚️ Fine-tune Voice Blend
              </h4>
              <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#6f6256" }}>
                Adjust the percentages below (they auto-total to 100%). Set any to 0% to exclude it.
              </p>

              <div style={styles.blendList}>
                {suggestions.map((persona, index) => (
                  <div key={persona.personaId} style={styles.blendItem}>
                    <div style={styles.personaInfo}>
                      <div style={styles.personaName}>{persona.personaName}</div>
                      <small style={styles.personaTraits}>
                        {persona.traits.length > 0 ? persona.traits.join(", ") : persona.reasoning}
                      </small>
                    </div>

                    <div style={styles.percentageControl}>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={isNaN(persona.suggestedPercentage) ? 0 : persona.suggestedPercentage}
                        onChange={(e) => handleSuggestionSliderChange(index, parseFloat(e.target.value))}
                        style={styles.slider}
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={isNaN(persona.suggestedPercentage) ? 0 : persona.suggestedPercentage}
                        onChange={(e) => handleSuggestionSliderChange(index, parseFloat(e.target.value))}
                        style={styles.percentInput}
                      />
                      <span style={styles.percentLabel}>%</span>
                    </div>

                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {index === suggestions.length - 1 && (
                        <div style={{ fontSize: "11px", color: "#16a34a", width: "50px", textAlign: "right", fontWeight: 600 }}>
                          auto
                        </div>
                      )}
                      <button
                        onClick={() => removePersona(persona.personaId)}
                        style={{
                          ...styles.button,
                          padding: "4px 8px",
                          fontSize: "11px",
                          backgroundColor: "#fee2e2",
                          color: "#991b1b",
                          border: "1px solid #fecaca",
                        }}
                        title="Remove this persona"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  ...styles.validationStatus,
                  border: `1px solid ${suggestionsTotal === 100 ? "#16a34a" : "#ea580c"}`,
                  marginTop: "12px",
                }}
              >
                <span style={{ fontSize: "12px", color: suggestionsTotal === 100 ? "#16a34a" : "#ea580c" }}>
                  {suggestionsTotal === 100 ? "✓" : "⚠"} Total: {suggestionsTotal.toFixed(1)}%
                </span>
              </div>

              <button
                onClick={generatePreview}
                disabled={suggestionsTotal !== 100 || previewLoading}
                style={{
                  ...styles.button,
                  ...styles.buttonPrimary,
                  opacity: suggestionsTotal !== 100 || previewLoading ? 0.5 : 1,
                  cursor: suggestionsTotal !== 100 || previewLoading ? "not-allowed" : "pointer",
                  marginTop: "12px",
                  width: "100%",
                }}
              >
                {previewLoading ? "Generating Preview..." : "Preview This Blend"}
              </button>

              {/* Add Persona from Library Section */}
              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "16px",
                  borderTop: "1px solid rgba(45, 36, 29, 0.1)",
                }}
              >
                <h5 style={{ margin: "0 0 12px 0", fontSize: "12px", fontWeight: 600, color: "#2d241d" }}>
                  ➕ Add Another Voice
                </h5>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <select
                    value={selectedPersonaForAdding}
                    onChange={(e) => setSelectedPersonaForAdding(e.target.value)}
                    style={{
                      ...styles.percentInput,
                      width: "100%",
                      padding: "8px",
                      fontFamily: "inherit",
                      backgroundColor: "#fff",
                    }}
                  >
                    <option value="">Select a persona from library...</option>
                    {availablePersonas
                      .filter((p) => !suggestions.some((s) => s.personaId === p.id))
                      .map((persona) => (
                        <option key={persona.id} value={persona.id}>
                          {persona.name}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={addPersonaFromLibrary}
                    disabled={!selectedPersonaForAdding}
                    style={{
                      ...styles.button,
                      ...styles.buttonPrimary,
                      fontSize: "12px",
                      padding: "8px 12px",
                      opacity: !selectedPersonaForAdding ? 0.5 : 1,
                      cursor: !selectedPersonaForAdding ? "not-allowed" : "pointer",
                    }}
                  >
                    Add Voice to Blend
                  </button>
                </div>
              </div>
            </div>
      )}

      {/* Blend Preview */}
      {blendPreview && (
        <div style={{ ...styles.section, marginTop: "20px" }}>
          <h4 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 600, color: "#2d241d" }}>
            📖 Voice Blend Preview
          </h4>
          <div
            style={{
              ...styles.blendPreview,
              fontSize: "13px",
              lineHeight: "1.7",
              fontFamily: "Georgia, serif",
              color: "#1a1a1a",
            }}
          >
            {blendPreview}
          </div>

          <button
            onClick={adoptBlend}
            disabled={isSaving}
            style={{
              ...styles.button,
              ...styles.buttonPrimary,
              opacity: isSaving ? 0.5 : 1,
              cursor: isSaving ? "not-allowed" : "pointer",
              marginTop: "12px",
              width: "100%",
            }}
          >
            {isSaving ? "Saving..." : "Save This Blend"}
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "24px",
    padding: "20px",
    backgroundColor: "#fefbf5",
    borderRadius: "8px",
  },
  header: {
    borderBottom: "1px solid rgba(45, 36, 29, 0.1)",
    paddingBottom: "16px",
  },
  title: {
    margin: "0 0 8px",
    fontSize: "20px",
    fontWeight: 600,
    color: "#2d241d",
  },
  subtitle: {
    margin: 0,
    fontSize: "14px",
    color: "#6f6256",
    lineHeight: 1.4,
  },
  section: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "12px",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 600,
    color: "#2d241d",
  },
  errorBox: {
    padding: "12px",
    backgroundColor: "#fee2e2",
    border: "1px solid #fecaca",
    borderRadius: "4px",
    color: "#991b1b",
    fontSize: "13px",
  },
  loading: {
    fontSize: "13px",
    color: "#6f6256",
    fontStyle: "italic",
  },
  suggestionsGrid: {
    display: "grid" as const,
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "12px",
  },
  suggestionCard: {
    padding: "12px",
    border: "1px solid rgba(45, 36, 29, 0.15)",
    borderRadius: "6px",
    backgroundColor: "#fff",
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "8px",
  },
  suggestionHeader: {
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
  },
  suggestionName: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#2d241d",
  },
  confidenceBadge: {
    padding: "2px 8px",
    borderRadius: "3px",
    color: "white",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "capitalize" as const,
  },
  reasoning: {
    margin: 0,
    fontSize: "12px",
    color: "#2d241d",
    lineHeight: 1.4,
  },
  traits: {
    fontSize: "11px",
    color: "#6f6256",
    margin: 0,
  },
  patterns: {
    fontSize: "11px",
    color: "#6f6256",
    margin: 0,
  },
  button: {
    padding: "8px 12px",
    borderRadius: "4px",
    border: "1px solid rgba(45, 36, 29, 0.2)",
    backgroundColor: "#fbf6ef",
    color: "#2d241d",
    fontSize: "12px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s",
  },
  buttonSmall: {
    padding: "6px 10px",
    fontSize: "11px",
  },
  buttonPrimary: {
    backgroundColor: "#16384f",
    color: "white",
    border: "1px solid #16384f",
  },
  buttonRemove: {
    padding: "4px 8px",
    fontSize: "12px",
  },
  emptyState: {
    fontSize: "13px",
    color: "#6f6256",
    fontStyle: "italic",
    margin: 0,
  },
  blendList: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "12px",
  },
  blendItem: {
    display: "grid" as const,
    gridTemplateColumns: "1fr 180px 60px",
    gap: "12px",
    alignItems: "center" as const,
    padding: "12px",
    border: "1px solid rgba(45, 36, 29, 0.15)",
    borderRadius: "6px",
    backgroundColor: "#fff",
  },
  personaInfo: {
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: "2px",
  },
  personaName: {
    fontSize: "13px",
    fontWeight: 600,
    color: "#2d241d",
  },
  personaTraits: {
    fontSize: "11px",
    color: "#6f6256",
  },
  percentageControl: {
    display: "flex" as const,
    gap: "8px",
    alignItems: "center" as const,
  },
  slider: {
    flex: 1,
  },
  percentInput: {
    width: "40px",
    padding: "4px 6px",
    border: "1px solid rgba(45, 36, 29, 0.2)",
    borderRadius: "4px",
    fontSize: "12px",
    textAlign: "center" as const,
  },
  percentLabel: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#2d241d",
  },
  validationStatus: {
    padding: "8px 12px",
    border: "1px solid",
    borderRadius: "4px",
    backgroundColor: "rgba(22, 163, 74, 0.05)",
    fontSize: "12px",
    fontWeight: 500,
  },
  blendPreview: {
    padding: "12px",
    backgroundColor: "rgba(22, 163, 74, 0.08)",
    border: "1px solid rgba(22, 163, 74, 0.2)",
    borderRadius: "4px",
    color: "#2d241d",
  },
};
