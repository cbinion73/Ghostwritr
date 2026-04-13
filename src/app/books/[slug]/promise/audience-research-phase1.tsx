"use client";

import { useState } from "react";
import type { AudienceResearchPhase1 } from "@/lib/promise-types";

interface AudienceResearchPhase1Props {
  slug: string;
  data: AudienceResearchPhase1 | null;
  isGenerating: boolean;
  onGenerate: () => void;
  onUpdate: (data: AudienceResearchPhase1) => void;
  onNext: () => void;
}

export default function AudienceResearchPhase1({
  slug,
  data,
  isGenerating,
  onGenerate,
  onUpdate,
  onNext,
}: AudienceResearchPhase1Props) {
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<"question" | "answer" | null>(null);
  const [editingTypeIndex, setEditingTypeIndex] = useState<number | null>(null);

  const handleEditQuestion = (index: number, field: "question" | "answer", newValue: string) => {
    if (!data) return;
    const updated = {
      ...data,
      researchQuestions: data.researchQuestions.map((q, i) =>
        i === index ? { ...q, [field]: newValue } : q
      ),
    };
    onUpdate(updated);
  };

  const handleDeleteQuestion = (index: number) => {
    if (!data) return;
    const updated = {
      ...data,
      researchQuestions: data.researchQuestions.filter((_, i) => i !== index),
    };
    onUpdate(updated);
  };

  const handleEditType = (index: number, field: string, newValue: string) => {
    if (!data) return;
    const updated = {
      ...data,
      identifiedUserTypes: data.identifiedUserTypes.map((type, i) => {
        if (i !== index) return type;
        if (field === "name") return { ...type, name: newValue };
        if (field === "description") return { ...type, description: newValue };
        return type;
      }),
    };
    onUpdate(updated);
  };

  const handleDeleteType = (index: number) => {
    if (!data) return;
    const updated = {
      ...data,
      identifiedUserTypes: data.identifiedUserTypes.filter((_, i) => i !== index),
    };
    onUpdate(updated);
  };

  const styles = {
    section: {
      display: "grid",
      gap: "24px",
    } as const,
    subsection: {
      display: "grid",
      gap: "16px",
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
    itemList: {
      display: "grid",
      gap: "12px",
    } as const,
    item: {
      display: "grid",
      gap: "8px",
      padding: "12px",
      backgroundColor: "rgba(255, 255, 255, 0.6)",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      borderRadius: "8px",
    } as const,
    itemHeader: {
      display: "grid",
      gridAutoFlow: "column" as const,
      justifyContent: "space-between",
      alignItems: "start",
      gap: "12px",
    } as const,
    itemText: {
      fontSize: "14px",
      color: "#2d241d",
      margin: 0,
    } as const,
    itemButtons: {
      display: "grid",
      gridAutoFlow: "column" as const,
      gap: "6px",
      justifyContent: "flex-end",
    } as const,
    smallButton: {
      padding: "4px 8px",
      fontSize: "11px",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      background: "transparent",
      borderRadius: "4px",
      cursor: "pointer",
      color: "#16384f",
      fontWeight: 500,
    } as const,
    textarea: {
      width: "100%",
      padding: "10px 12px",
      fontSize: "13px",
      border: "1px solid rgba(59, 44, 31, 0.2)",
      borderRadius: "6px",
      fontFamily: "inherit",
      resize: "vertical" as const,
      minHeight: "80px",
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
    buttonDisabled: {
      opacity: 0.5,
      cursor: "not-allowed",
    } as const,
    controls: {
      display: "grid",
      gap: "12px",
      gridAutoFlow: "column" as const,
      justifyContent: "flex-end",
    } as const,
    typeCard: {
      display: "grid",
      gap: "12px",
      padding: "14px",
      backgroundColor: "#f8f2e8",
      border: "1px solid rgba(59, 44, 31, 0.12)",
      borderRadius: "8px",
    } as const,
    typeCardHeader: {
      display: "grid",
      gap: "6px",
    } as const,
    typeCardLabel: {
      fontSize: "12px",
      fontWeight: 700,
      textTransform: "uppercase" as const,
      color: "#6f6256",
    } as const,
    typeCardInput: {
      width: "100%",
      padding: "10px 12px",
      fontSize: "14px",
      fontWeight: 600,
      border: "1px solid rgba(59, 44, 31, 0.2)",
      borderRadius: "6px",
      fontFamily: "inherit",
    } as const,
    detailsList: {
      display: "grid",
      gap: "8px",
    } as const,
    detailItem: {
      fontSize: "13px",
      color: "#6f6256",
      paddingLeft: "16px",
      position: "relative" as const,
    } as const,
    emptyState: {
      padding: "32px 24px",
      textAlign: "center" as const,
      color: "#6f6256",
      fontSize: "14px",
    } as const,
  };

  return (
    <div style={styles.section}>
      {/* Generate Button */}
      {!data && (
        <div style={{ textAlign: "center" }}>
          <button
            style={{
              ...styles.button,
              ...(isGenerating ? styles.buttonDisabled : {}),
            }}
            onClick={onGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? "Generating Phase 1..." : "Generate Research Questions & User Types"}
          </button>
        </div>
      )}

      {/* Data Display */}
      {data && (
        <>
          {/* Research Questions */}
          <div style={styles.subsection}>
            <div>
              <h3 style={styles.heading}>Research Questions</h3>
              <p style={styles.description}>
                5-7 probing questions that define your audience
              </p>
            </div>

            {data.researchQuestions.length > 0 ? (
              <div style={styles.itemList}>
                {data.researchQuestions.map((qItem, index) => (
                  <div key={index} style={{ ...styles.typeCard, display: "grid", gap: "12px" }}>
                    {/* Question */}
                    <div>
                      <label style={styles.typeCardLabel}>Question</label>
                      {editingQuestionIndex === index && editingField === "question" ? (
                        <textarea
                          style={styles.textarea}
                          value={qItem.question}
                          onChange={(e) => handleEditQuestion(index, "question", e.target.value)}
                          onBlur={() => {
                            setEditingQuestionIndex(null);
                            setEditingField(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <>
                          <p style={{ ...styles.itemText, fontWeight: 600, margin: "8px 0 0" }}>
                            {qItem.question}
                          </p>
                          <button
                            style={{ ...styles.smallButton, marginTop: "6px" }}
                            onClick={() => {
                              setEditingQuestionIndex(index);
                              setEditingField("question");
                            }}
                          >
                            Edit Question
                          </button>
                        </>
                      )}
                    </div>

                    {/* Answer */}
                    <div>
                      <label style={styles.typeCardLabel}>Answer</label>
                      {editingQuestionIndex === index && editingField === "answer" ? (
                        <textarea
                          style={styles.textarea}
                          value={qItem.answer}
                          onChange={(e) => handleEditQuestion(index, "answer", e.target.value)}
                          onBlur={() => {
                            setEditingQuestionIndex(null);
                            setEditingField(null);
                          }}
                          autoFocus
                        />
                      ) : (
                        <>
                          <p style={{ ...styles.description, margin: "8px 0 0" }}>
                            {qItem.answer}
                          </p>
                          <button
                            style={{ ...styles.smallButton, marginTop: "6px" }}
                            onClick={() => {
                              setEditingQuestionIndex(index);
                              setEditingField("answer");
                            }}
                          >
                            Edit Answer
                          </button>
                        </>
                      )}
                    </div>

                    {/* Delete Button */}
                    <div style={styles.itemButtons}>
                      <button
                        style={styles.smallButton}
                        onClick={() => handleDeleteQuestion(index)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyState}>No research questions yet</div>
            )}
          </div>

          {/* Identified User Types */}
          <div style={styles.subsection}>
            <div>
              <h3 style={styles.heading}>Identified User Types</h3>
              <p style={styles.description}>
                3-4 role-based market segments that benefit from your book
              </p>
            </div>

            {data.identifiedUserTypes.length > 0 ? (
              <div style={styles.itemList}>
                {data.identifiedUserTypes.map((userType, index) => (
                  <div key={index} style={styles.typeCard}>
                    <div style={styles.typeCardHeader}>
                      <label style={styles.typeCardLabel}>User Type Name</label>
                      {editingTypeIndex === index ? (
                        <input
                          style={styles.typeCardInput}
                          value={userType.name}
                          onChange={(e) =>
                            handleEditType(index, "name", e.target.value)
                          }
                          onBlur={() => setEditingTypeIndex(null)}
                          autoFocus
                        />
                      ) : (
                        <p style={{ ...styles.itemText, fontWeight: 600 }}>
                          {userType.name}
                        </p>
                      )}
                    </div>

                    <div>
                      <label style={styles.typeCardLabel}>Description</label>
                      {editingTypeIndex === index ? (
                        <textarea
                          style={styles.textarea}
                          value={userType.description}
                          onChange={(e) =>
                            handleEditType(index, "description", e.target.value)
                          }
                        />
                      ) : (
                        <p style={styles.description}>{userType.description}</p>
                      )}
                    </div>

                    {userType.details.length > 0 && (
                      <div>
                        <label style={styles.typeCardLabel}>Details</label>
                        <ul style={styles.detailsList}>
                          {userType.details.map((detail, dIdx) => (
                            <li key={dIdx} style={styles.detailItem}>
                              {detail}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div style={styles.itemButtons}>
                      <button
                        style={styles.smallButton}
                        onClick={() =>
                          setEditingTypeIndex(
                            editingTypeIndex === index ? null : index
                          )
                        }
                      >
                        {editingTypeIndex === index ? "Done" : "Edit"}
                      </button>
                      <button
                        style={styles.smallButton}
                        onClick={() => handleDeleteType(index)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyState}>No user types identified yet</div>
            )}
          </div>

          {/* Navigation */}
          <div style={styles.controls}>
            <button
              style={{
                ...styles.button,
                ...(isGenerating ? styles.buttonDisabled : {}),
              }}
              onClick={onNext}
              disabled={isGenerating}
            >
              Next: Deep Personas →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
