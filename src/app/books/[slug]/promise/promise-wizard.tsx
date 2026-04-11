"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PromiseWizardProps {
  slug: string;
  onComplete?: () => void;
}

type WizardStep = "upload" | "direction" | "complete";

export function PromiseWizard({ slug, onComplete }: PromiseWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>("upload");
  const [files, setFiles] = useState<File[]>([]);
  const [direction, setDirection] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.currentTarget.files || []);
    setFiles(selectedFiles);
  };

  const handleUploadNext = () => {
    if (files.length > 0 || direction) {
      // Could upload files here if desired, or skip to next step
      setStep("direction");
    }
  };

  const handleDirectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!direction.trim()) return;

    setIsLoading(true);

    try {
      // Upload files if any
      if (files.length > 0) {
        const formData = new FormData();
        files.forEach((file) => formData.append("files", file));
        formData.append("note", "Uploaded during promise setup");

        await fetch(`/api/books/${slug}/promise-references`, {
          method: "POST",
          body: formData,
        });
      }

      // Submit initial direction
      const directionFormData = new FormData();
      directionFormData.append("message", direction);

      await fetch(`/books/${slug}/promise`, {
        method: "POST",
        body: directionFormData,
      });

      // Redirect to promise editor
      setStep("complete");
      router.push(`/books/${slug}/promise`);
      onComplete?.();
    } catch (error) {
      console.error("Wizard error:", error);
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.modal}>
        {step === "upload" && (
          <div style={styles.step}>
            <h2>Book Promise Setup</h2>
            <p style={styles.subtitle}>Let's get started with your book idea</p>

            <div style={styles.card}>
              <h3>Step 1: Upload Reference Materials (Optional)</h3>
              <p style={styles.help}>
                Add PDFs, presentations, images, or notes that will help shape your promise.
              </p>
              <label style={styles.fileInputLabel}>
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <span style={styles.fileInputButton}>
                  {files.length > 0
                    ? `${files.length} file${files.length !== 1 ? "s" : ""} selected`
                    : "Choose Files"}
                </span>
              </label>
              {files.length > 0 && (
                <div style={styles.fileList}>
                  {files.map((file, i) => (
                    <div key={i} style={styles.fileItem}>
                      {file.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.buttonRow}>
              <button
                style={styles.btnSecondary}
                onClick={() => setStep("direction")}
              >
                Skip & Continue
              </button>
              <button
                style={styles.btnPrimary}
                onClick={handleUploadNext}
                disabled={files.length === 0}
              >
                Continue with Files
              </button>
            </div>
          </div>
        )}

        {step === "direction" && (
          <div style={styles.step}>
            <h2>Book Promise Setup</h2>
            <p style={styles.subtitle}>Tell us about your book idea</p>

            <div style={styles.card}>
              <h3>Step 2: Your Initial Idea or Direction</h3>
              <p style={styles.help}>
                Describe what your book is about, who it's for, and what you hope it will accomplish.
              </p>
              <form onSubmit={handleDirectionSubmit} style={styles.form}>
                <textarea
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  placeholder="Example: I want to write a practical guide for lab leaders transitioning into management roles, combining scientific rigor with modern team dynamics..."
                  style={styles.textarea}
                  disabled={isLoading}
                />
                <div style={styles.buttonRow}>
                  <button
                    type="button"
                    style={styles.btnSecondary}
                    onClick={() => setStep("upload")}
                    disabled={isLoading}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    style={styles.btnPrimary}
                    disabled={!direction.trim() || isLoading}
                  >
                    {isLoading ? "Creating..." : "Create Promise"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    backgroundColor: "var(--panel, #fefbf5)",
    borderRadius: "12px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.2)",
    maxWidth: "600px",
    width: "90%",
    padding: "40px",
    maxHeight: "90vh",
    overflowY: "auto" as const,
  },
  step: {
    display: "grid",
    gap: "24px",
  },
  subtitle: {
    color: "var(--muted, #6f6256)",
    fontSize: "16px",
    margin: 0,
  },
  card: {
    display: "grid",
    gap: "16px",
    padding: "20px",
    backgroundColor: "var(--paper, #fbf6ef)",
    borderRadius: "8px",
    border: "1px solid rgba(45, 36, 29, 0.1)",
  },
  help: {
    color: "var(--muted, #6f6256)",
    fontSize: "14px",
    margin: 0,
    lineHeight: 1.6,
  },
  fileInputLabel: {
    display: "block",
    cursor: "pointer",
  },
  fileInputButton: {
    display: "inline-block",
    padding: "12px 16px",
    backgroundColor: "var(--accent, #16384f)",
    color: "white",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
  fileList: {
    display: "grid",
    gap: "8px",
  },
  fileItem: {
    padding: "8px 12px",
    backgroundColor: "rgba(139, 109, 50, 0.1)",
    borderRadius: "4px",
    fontSize: "14px",
    color: "var(--ink, #2d241d)",
  },
  form: {
    display: "grid",
    gap: "16px",
  },
  textarea: {
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid rgba(45, 36, 29, 0.2)",
    fontFamily: "inherit",
    fontSize: "14px",
    lineHeight: 1.6,
    minHeight: "120px",
    resize: "vertical" as const,
  },
  buttonRow: {
    display: "flex",
    gap: "12px",
    justifyContent: "flex-end",
  },
  btnPrimary: {
    padding: "12px 24px",
    backgroundColor: "var(--accent, #16384f)",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
  btnSecondary: {
    padding: "12px 24px",
    backgroundColor: "var(--paper, #fbf6ef)",
    color: "var(--ink, #2d241d)",
    border: "1px solid rgba(45, 36, 29, 0.2)",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
};
