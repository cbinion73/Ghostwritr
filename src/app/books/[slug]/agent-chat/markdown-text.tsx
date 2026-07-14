import type { ReactNode } from "react";

function inlineMarkdown(line: string): ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function MarkdownText({ text }: { text: string }) {
  if (!text) return null;

  return (
    <>
      {text.split("\n").map((line, index) => {
        if (/^#{1,3} /.test(line)) {
          const level = line.match(/^(#+)/)?.[1].length ?? 1;
          const sizes = ["18px", "15px", "13px"];
          return (
            <div key={index} style={{ fontSize: sizes[level - 1] ?? "13px", fontWeight: 700, marginTop: level === 1 ? 16 : 12, marginBottom: 4, color: "#2a1f14" }}>
              {inlineMarkdown(line.replace(/^#+\s+/, ""))}
            </div>
          );
        }
        if (/^---+$/.test(line.trim())) {
          return <hr key={index} style={{ border: "none", borderTop: "1px solid rgba(45,36,29,0.12)", margin: "10px 0" }} />;
        }
        if (line.trim() === "") return <div key={index} style={{ height: 8 }} />;
        if (/^- /.test(line)) {
          return (
            <div key={index} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
              <span style={{ color: "#B8793A", flexShrink: 0 }}>•</span>
              <span>{inlineMarkdown(line.slice(2))}</span>
            </div>
          );
        }
        return <p key={index} style={{ margin: "2px 0 6px" }}>{inlineMarkdown(line)}</p>;
      })}
    </>
  );
}
