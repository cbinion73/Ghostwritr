export function escapeMarkdownPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractMarkdownLabeledValue(markdown: string, label: string): string | undefined {
  const pattern = new RegExp(`\\*\\*${escapeMarkdownPattern(label)}:\\*\\*\\s*([^\\n]+)`, "i");
  const match = markdown.match(pattern);
  return match?.[1]?.trim();
}

export function extractExecutiveSummaryFromMarkdown(markdown: string, fallback: string): string {
  const match = markdown.match(
    /#\s*EXECUTIVE SUMMARY\s+([\s\S]*?)(?:\n#\s*SECTION 1:|\n##\s*SECTION 1:|$)/i,
  );

  if (!match?.[1]) {
    return fallback;
  }

  const cleaned = match[1]
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length > 0 ? cleaned.slice(0, 1800) : fallback;
}

export function extractMarkdownSection(markdown: string, heading: string): string | undefined {
  const pattern = new RegExp(
    `(?:^|\\n)(?:#|##|###)\\s*${escapeMarkdownPattern(heading)}\\s*\\n([\\s\\S]*?)(?=\\n(?:#|##|###)\\s+|$)`,
    "i",
  );
  const match = markdown.match(pattern);
  return match?.[1]?.trim();
}

export function extractMarkdownNumberedList(markdown: string, heading: string): string[] {
  const section = extractMarkdownSection(markdown, heading);
  if (!section) {
    return [];
  }

  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, "").trim())
    .filter((line) => line.length > 0);
}
