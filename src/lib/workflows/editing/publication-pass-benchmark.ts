import type { PublicationPassCategory, PublicationPassReport } from "../../editing-types";

export type PublicationPassBenchmarkCase = {
  id: string;
  category: PublicationPassCategory;
  searchTerms: string[];
  requiredSeverity?: "blocker" | "required" | "recommended" | "advisory";
};

export type PublicationPassBenchmarkScore = {
  detected: number;
  expected: number;
  recall: number;
  missedCaseIds: string[];
  invalidFindings: number;
  fabricatedSourceCount: number;
  passes: boolean;
};

/**
 * The first benchmark is distilled from the confirmed corrections in Dust.
 * It intentionally stores only short diagnostic phrases, not manuscript prose.
 */
export const DUST_PUBLICATION_BENCHMARK: PublicationPassBenchmarkCase[] = [
  { id: "unsupported-dust-history", category: "history", searchTerms: ["dust", "blessing"], requiredSeverity: "required" },
  { id: "phone-check-statistic", category: "citation", searchTerms: ["phone", "times"], requiredSeverity: "required" },
  { id: "acts-recognition-greek", category: "greek-hebrew", searchTerms: ["recognized", "greek"], requiredSeverity: "required" },
  { id: "acts-six-week-chronology", category: "scripture", searchTerms: ["six weeks"], requiredSeverity: "required" },
  { id: "tracy-disclosure", category: "author-decision", searchTerms: ["tracy"], requiredSeverity: "blocker" },
  { id: "manuscript-repetition", category: "repetition", searchTerms: ["repetition"], requiredSeverity: "recommended" },
];

export function scorePublicationPassBenchmark(
  report: PublicationPassReport,
  cases: PublicationPassBenchmarkCase[] = DUST_PUBLICATION_BENCHMARK,
): PublicationPassBenchmarkScore {
  const activeFindings = report.findings.filter((finding) => finding.disposition !== "rejected");
  const missedCaseIds: string[] = [];

  for (const benchmarkCase of cases) {
    const matched = activeFindings.some((finding) => {
      if (finding.category !== benchmarkCase.category) return false;
      if (benchmarkCase.requiredSeverity && finding.severity !== benchmarkCase.requiredSeverity) return false;
      const haystack = `${finding.findThis} ${finding.changeTo ?? ""} ${finding.reason}`.toLocaleLowerCase();
      return benchmarkCase.searchTerms.every((term) => haystack.includes(term.toLocaleLowerCase()));
    });
    if (!matched) missedCaseIds.push(benchmarkCase.id);
  }

  const fabricatedSourceCount = activeFindings.filter(
    (finding) => Boolean(finding.sourceUrl) && !/^https:\/\//i.test(finding.sourceUrl ?? ""),
  ).length;
  const detected = cases.length - missedCaseIds.length;
  const recall = cases.length === 0 ? 1 : detected / cases.length;

  return {
    detected,
    expected: cases.length,
    recall,
    missedCaseIds,
    invalidFindings: report.invalidFindingCount,
    fabricatedSourceCount,
    passes: recall >= 0.95 && report.invalidFindingCount === 0 && fabricatedSourceCount === 0,
  };
}
