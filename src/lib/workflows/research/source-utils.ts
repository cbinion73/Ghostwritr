import type { ResearchSourceTier } from "../../research-types";

export function getMessageTextContent(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          part.type === "text" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("\n");
  }

  return "";
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function classifySourceTier(url: string): {
  tier: ResearchSourceTier;
  weight: number;
} {
  const normalized = url.toLowerCase();

  const tierAIndicators = [
    ".gov/",
    ".gov?",
    ".gov",
    "doi.org",
    "ncbi.nlm.nih.gov",
    "pubmed",
    "census.gov",
    "bls.gov",
    "oecd.org",
    "worldbank.org",
    "nih.gov",
  ];

  const tierCIndicators = [
    "reddit.com",
    "medium.com",
    "substack.com",
    "blog.",
    "blogspot.",
    "wordpress.",
  ];

  if (tierAIndicators.some((indicator) => normalized.includes(indicator))) {
    return { tier: "A", weight: 1 };
  }

  if (tierCIndicators.some((indicator) => normalized.includes(indicator))) {
    return { tier: "C", weight: 0.5 };
  }

  return { tier: "B", weight: 0.75 };
}

export function summarizeQueries(queries: string[]) {
  return queries.slice(0, 2).join(" | ");
}

export function summarizeDomains(urls: string[]) {
  const domains = Array.from(
    new Set(
      urls.flatMap((url) => {
        try {
          return [new URL(url).hostname.replace(/^www\./, "")];
        } catch {
          return [];
        }
      }),
    ),
  );

  return domains.slice(0, 3).join(", ");
}
