/**
 * Research lenses — per-book genre profiles that shape how Scout (Research)
 * and Chronicle (External Stories) search, evaluate, and tier sources.
 *
 * A leadership book and a Bible-study book need very different evidence:
 * "statistics data survey" queries and business-press tier rules make no
 * sense for exegesis, where the authorities are commentaries, lexicons, and
 * peer-reviewed biblical scholarship. The lens is chosen once in Book Setup
 * and applied automatically everywhere research happens.
 */

export type ResearchLensKey =
  | "general"
  | "biblical"
  | "academic"
  | "business"
  | "health"
  | "memoir";

export type ResearchLens = {
  key: ResearchLensKey;
  label: string;
  description: string;
  /**
   * Query templates mixed into web searches. `{topic}` is replaced with the
   * chapter topic. 3–4 per lens; they replace the generic
   * evidence/statistics/framework/criticism set.
   */
  queryTemplates: string[];
  /** Broad subject-level query suffixes (replace "industry report 2024"). */
  subjectQueries: string[];
  /** Source-tier rules injected into Scout's system prompt. */
  tierRules: string;
  /** Extra research directives injected into Scout's system prompt. */
  directives: string;
  /** Story-sourcing guidance injected into Chronicle's system prompt. */
  storyGuidance: string;
  /**
   * Web-search query templates for finding STORIES (not evidence) — the
   * External Stories / Chronicle equivalent of queryTemplates. Without this,
   * story search fell back to generic "case study" / "company turnaround"
   * business-book phrasing regardless of genre, so a Biblical/Theological
   * book's External Stories dossier filled up with Gandhi, BYD, and Starbucks
   * instead of testimonies and church-history accounts.
   */
  storyQueryTemplates: string[];
};

const LENSES: Record<ResearchLensKey, ResearchLens> = {
  general: {
    key: "general",
    label: "General Nonfiction",
    description: "Balanced evidence gathering: studies, statistics, expert frameworks, and counterpoints.",
    queryTemplates: [
      '"{topic}" research study evidence',
      '"{topic}" statistics data report',
      '"{topic}" expert framework methodology',
      '"{topic}" criticism limitations risks',
    ],
    subjectQueries: ["industry report 2024", "survey data statistics"],
    tierRules: "",
    directives: "",
    storyGuidance: "",
    storyQueryTemplates: [
      '"{topic}" inspiring true story',
      '"{topic}" real life example account',
      '"{topic}" turnaround story',
      '"{topic}" personal account first hand',
    ],
  },

  biblical: {
    key: "biblical",
    label: "Biblical / Theological",
    description: "Scripture cross-references, original-language word studies, historical context, and scholarly commentary.",
    queryTemplates: [
      '"{topic}" biblical commentary exegesis',
      '"{topic}" Greek Hebrew word study meaning',
      '"{topic}" first century historical context Judaism',
      '"{topic}" theology scholarly journal disputed interpretation',
    ],
    subjectQueries: ["biblical scholarship peer reviewed", "church history primary sources"],
    tierRules: `SOURCE TIERS FOR THIS BOOK (Biblical/Theological lens):
- Tier 1 (A): peer-reviewed biblical scholarship (JBL, NTS, JETS), standard academic commentaries (NICOT/NICNT, Word, Anchor Yale, Pillar), lexicons (BDAG, HALOT), and primary sources (Mishnah, Talmud, Josephus, church fathers) with citations.
- Tier 2 (B): reputable publishers (Zondervan, IVP Academic, Crossway, Eerdmans), established study-Bible notes, seminary-affiliated resources (TGC, Bible Project with caveats).
- Tier 3 (C): sermons, ministry blogs, devotionals — use only for illustration, never as the sole support for a historical or exegetical claim.`,
    directives: `RESEARCH DIRECTIVES (Biblical/Theological lens):
- Cite scripture with book, chapter, and verse; note the translation used.
- For original-language claims, name the lexicon or scholarly source — never assert a Greek/Hebrew meaning from a sermon or blog alone.
- Flag popular-but-contested claims explicitly (e.g., widely preached historical anecdotes about first-century customs whose primary-source basis is thin) as counterpoints with what the primary sources actually say.
- Distinguish "the text says" from "tradition holds" from "scholars debate" — the author must never be embarrassed by an over-claimed anecdote.
- Where interpretations divide along traditions, note the major positions neutrally rather than picking one.`,
    storyGuidance: `STORY SOURCING (Biblical/Theological lens): favor testimonies, church-history figures (with dates and documented sources), missionary accounts, and contemporary discipleship stories. Verify biographical claims about historical figures against published biographies, not sermon retellings.`,
    storyQueryTemplates: [
      '"{topic}" testimony transformation story',
      '"{topic}" missionary account true story',
      '"{topic}" church history figure biography',
      '"{topic}" discipleship story real life',
    ],
  },

  academic: {
    key: "academic",
    label: "Academic / Scientific",
    description: "Peer-reviewed literature, methodology-aware evidence, and replication status.",
    queryTemplates: [
      '"{topic}" peer reviewed study meta-analysis',
      '"{topic}" replication effect size sample',
      '"{topic}" systematic review evidence quality',
      '"{topic}" criticism methodological limitations',
    ],
    subjectQueries: ["state of the research review", "landmark studies replication"],
    tierRules: `SOURCE TIERS FOR THIS BOOK (Academic/Scientific lens):
- Tier 1 (A): peer-reviewed journals, meta-analyses, systematic reviews, official statistics bodies.
- Tier 2 (B): university press books, preprints from credible labs, science journalism that links primary sources (Nature news, Science news).
- Tier 3 (C): popular-science books, TED talks, media summaries — always trace back to the primary study.`,
    directives: `RESEARCH DIRECTIVES (Academic/Scientific lens): report sample sizes and effect sizes where available; note replication status; never present a single small study as settled fact; prefer the most recent systematic review over older individual studies.`,
    storyGuidance: `STORY SOURCING (Academic/Scientific lens): favor documented case studies from the literature, named researchers' discovery narratives, and well-sourced histories of scientific breakthroughs.`,
    storyQueryTemplates: [
      '"{topic}" scientist discovery story',
      '"{topic}" researcher breakthrough account',
      '"{topic}" case study real world application',
      '"{topic}" historical scientific turning point',
    ],
  },

  business: {
    key: "business",
    label: "Business / Leadership",
    description: "Company cases, market data, named frameworks, and practitioner evidence.",
    queryTemplates: [
      '"{topic}" case study company results',
      '"{topic}" market data benchmark report',
      '"{topic}" framework methodology practitioner',
      '"{topic}" failure post-mortem lessons',
    ],
    subjectQueries: ["industry report 2024", "benchmark survey data"],
    tierRules: `SOURCE TIERS FOR THIS BOOK (Business/Leadership lens):
- Tier 1 (A): HBR, academic management journals, audited filings, named-methodology primary sources, official statistics.
- Tier 2 (B): major business press (WSJ, FT, Economist, Bloomberg), reputable analyst reports, first-party company engineering/culture blogs.
- Tier 3 (C): LinkedIn posts, consultant marketing content, unattributed listicles — illustration only.`,
    directives: `RESEARCH DIRECTIVES (Business/Leadership lens): prefer named companies with dates and numbers over anonymized composites; check whether a celebrated case later reversed (follow the story past the famous moment); attribute frameworks to their originators.`,
    storyGuidance: `STORY SOURCING (Business/Leadership lens): favor named companies and leaders with verifiable timelines; include at least one failure/recovery arc; avoid retelling the same five famous cases every business book uses unless the chapter genuinely needs one.`,
    storyQueryTemplates: [
      '"{topic}" leader company case study',
      '"{topic}" inspiring leadership story',
      '"{topic}" true company turnaround story',
      '"{topic}" crisis leadership example',
    ],
  },

  health: {
    key: "health",
    label: "Health / Wellness",
    description: "Clinical evidence with strong tier discipline and clear safety caveats.",
    queryTemplates: [
      '"{topic}" clinical trial evidence outcomes',
      '"{topic}" meta-analysis systematic review',
      '"{topic}" guidelines recommendation medical association',
      '"{topic}" risks contraindications criticism',
    ],
    subjectQueries: ["clinical guidelines current", "evidence review outcomes"],
    tierRules: `SOURCE TIERS FOR THIS BOOK (Health/Wellness lens):
- Tier 1 (A): RCTs, Cochrane reviews, clinical guidelines from major medical bodies (WHO, NIH, specialty associations).
- Tier 2 (B): peer-reviewed observational studies, academic medical center patient resources (Mayo, Cleveland Clinic).
- Tier 3 (C): wellness media, practitioner blogs, supplement-industry content — treat as claims to verify, not evidence.`,
    directives: `RESEARCH DIRECTIVES (Health/Wellness lens): distinguish association from causation explicitly; note study populations; every actionable health claim needs Tier 1 or Tier 2 support; include standard-of-care context so the book never reads as medical advice replacing a clinician.`,
    storyGuidance: `STORY SOURCING (Health/Wellness lens): patient stories must be documented (published interviews, memoirs, case reports) — never invented composites presented as real; prefer stories that show the ordinary struggle, not just miracle outcomes.`,
    storyQueryTemplates: [
      '"{topic}" patient story real account',
      '"{topic}" recovery journey testimony',
      '"{topic}" clinician case report story',
      '"{topic}" health turnaround true story',
    ],
  },

  memoir: {
    key: "memoir",
    label: "Memoir / Narrative",
    description: "Light-touch factual verification: dates, places, cultural context, and era detail.",
    queryTemplates: [
      '"{topic}" historical timeline dates',
      '"{topic}" cultural context era',
      '"{topic}" place history background',
    ],
    subjectQueries: ["era timeline events", "cultural history context"],
    tierRules: `SOURCE TIERS FOR THIS BOOK (Memoir/Narrative lens):
- Tier 1 (A): newspapers of record from the period, archives, official records.
- Tier 2 (B): published histories and biographies of the era/places involved.
- Tier 3 (C): nostalgia sites, forums — useful for texture leads, verify anything factual.`,
    directives: `RESEARCH DIRECTIVES (Memoir/Narrative lens): the author's memory is the primary source for personal events — research verifies the checkable frame around it (dates, geography, prices, what was on the radio); flag any public fact the manuscript states that conflicts with the record so the author can decide.`,
    storyGuidance: `STORY SOURCING (Memoir/Narrative lens): external stories are supporting texture — contemporaneous events, what the world was doing during the author's moments; keep them brief and verifiable.`,
    storyQueryTemplates: [
      '"{topic}" historical event eyewitness account',
      '"{topic}" true story from the era',
      '"{topic}" personal account period',
      '"{topic}" contemporaneous story',
    ],
  },
};

export const RESEARCH_LENS_OPTIONS: ResearchLens[] = Object.values(LENSES);

export function resolveResearchLens(key: unknown): ResearchLens {
  if (typeof key === "string" && key in LENSES) {
    return LENSES[key as ResearchLensKey];
  }
  return LENSES.general;
}

/** Build the per-topic search queries for a lens (replaces the generic set). */
export function buildLensQueries(
  lens: ResearchLens,
  topics: string[],
  userFocus: string | null,
  bookSubject: string,
): string[] {
  const queries: string[] = [];

  if (userFocus) {
    for (const template of lens.queryTemplates) {
      queries.push(template.replace(/"?\{topic\}"?/g, userFocus));
    }
    return queries.slice(0, 4);
  }

  for (const topic of topics.slice(0, 3)) {
    for (const template of lens.queryTemplates) {
      queries.push(template.replace(/\{topic\}/g, topic));
    }
  }

  if (bookSubject) {
    for (const suffix of lens.subjectQueries) {
      queries.push(`${bookSubject} ${suffix}`);
    }
  }

  return queries.slice(0, 16);
}

/**
 * Build the per-topic STORY search queries for a lens — the External
 * Stories / Chronicle equivalent of buildLensQueries. Uses
 * storyQueryTemplates (phrased for finding true-story leads) instead of
 * queryTemplates (phrased for finding evidence).
 */
export function buildLensStoryQueries(
  lens: ResearchLens,
  topics: string[],
  bookSubject: string,
): string[] {
  const queries: string[] = [];

  for (const topic of topics.slice(0, 3)) {
    for (const template of lens.storyQueryTemplates) {
      queries.push(template.replace(/\{topic\}/g, topic));
    }
  }

  if (bookSubject) {
    for (const suffix of lens.subjectQueries) {
      queries.push(`${bookSubject} ${suffix}`);
    }
  }

  return queries.slice(0, 16);
}
