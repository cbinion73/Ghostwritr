import { ArtifactType, BookWorkflowType, Prisma, StageKey, StageStatus } from "@prisma/client";

import { createBookWithStages, deleteBookBySlug, getBookBySlug, updateStageForBook } from "../src/lib/repositories/books";
import { createBookSetupVersion, commitBookSetup } from "../src/lib/repositories/book-setup-artifacts";
import { createPromiseArtifactVersion, commitPromiseStageBundle } from "../src/lib/repositories/promise-artifacts";
import {
  createOutlineExpansionVersion,
  createOutlineVersion,
  commitOutlineExpansionBundle,
  commitOutlineStageBundle,
} from "../src/lib/repositories/outline-artifacts";
import { createBaseStoryVersion, commitBaseStory } from "../src/lib/repositories/base-story-artifacts";
import { createPersonalStoriesArtifactVersion, commitPersonalStoriesStageBundle } from "../src/lib/repositories/personal-stories-artifacts";
import { createFictionArtifactVersion, commitFictionArtifact } from "../src/lib/repositories/fiction-artifacts";
import { createResearchPackVersion, commitResearchPack } from "../src/lib/repositories/research-artifacts";
import { createExternalStoryPackVersion, commitExternalStoryPack } from "../src/lib/repositories/external-stories-artifacts";
import {
  assembleManuscriptWorkflow,
  preparePublishingPackageWorkflow,
} from "../src/lib/workflows/editing";
import {
  runChapterDraftWorkflow,
  commitAllChapterDraftsWorkflow,
} from "../src/lib/workflows/chapter-draft";
import {
  commitFictionStageWorkflow,
  generateFictionDraftChapterWorkflow,
} from "../src/lib/workflows/fiction";

async function resetFixtureBook(slug: string) {
  const existing = await getBookBySlug(slug);
  if (existing) {
    await deleteBookBySlug(slug);
  }
}

async function seedNonfictionSmoke() {
  const slug = "nonfiction-smoke";
  await resetFixtureBook(slug);

  const book = await createBookWithStages({
    slug,
    titleWorking: "Systems of Influence",
    subtitle: "A field guide to building trust, alignment, and durable leadership momentum",
    workflowType: BookWorkflowType.NONFICTION,
    metadataJson: {
      fixture: true,
      purpose: "nonfiction regression smoke",
    } satisfies Prisma.InputJsonValue,
  });

  await createBookSetupVersion({
    bookId: book.id,
    profile: {
      workingTitle: "Systems of Influence",
      subtitle: "A field guide to building trust, alignment, and durable leadership momentum",
      writerPersona: "Strategic Systems Ghostwriter",
      baseStoryFormatPreference: "GUIDE_JOURNEY",
      voiceReferenceNotes: ["Calm authority", "Diagnostic clarity", "Grounded optimism"],
      targetWordCount: 42000,
      wordCountTolerance: 2500,
      targetPageCount: 190,
      trimSize: "6 x 9 in",
      outputFormats: ["PRINT", "EBOOK"],
      aiAuthorshipGuardEnabled: true,
      provenanceTrackingEnabled: true,
      marketingHandoffEnabled: true,
      notesToSystem: ["Favor practical strategy over hype."],
    },
  });
  await commitBookSetup(book.id);

  const promiseBrief = {
    workingTitle: "Systems of Influence",
    audiencePrimary: "Founders and senior operators leading teams through growth and complexity.",
    audienceSecondary: ["Department heads", "Team leads", "Advisors to scaling companies"],
    category: "Leadership / Organizational Effectiveness",
    readerProblem: "They keep compensating for systemic confusion with personal effort.",
    readerDesire: "They want a durable operating model for trust, alignment, and accountability.",
    bigIdea: "Influence is a system leaders build, not a trait they perform.",
    coreTruth: "Teams do not become reliable because leaders push harder; they become reliable when conditions are clear and trusted.",
    transformationBefore: "Capable but overextended leaders are patching recurring dysfunction one conversation at a time.",
    transformationAfter: "They can diagnose weak pillars quickly and build conditions that create self-sustaining momentum.",
    differentiation: "This book treats leadership breakdowns as structural design failures rather than personality failures.",
    promiseStatement: "This book gives leaders a clear system for building trust, alignment, ownership, and accountability at scale.",
    stakes: "Without a system, growth multiplies confusion and politics.",
    tone: ["Strategic", "Practical", "Trust-first"],
    openQuestions: ["How do the four pillars reinforce one another over time?"],
  };

  await createPromiseArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PROMISE_BRIEF,
    title: "Promise Brief",
    summary: "Core promise locked for the nonfiction smoke fixture.",
    contentJson: promiseBrief,
    contentText: JSON.stringify(promiseBrief, null, 2),
    modelName: "fixture",
  });

  await createPromiseArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.BOOK_PROMISE_REPORT,
    title: "Book Promise Report",
    summary: "Reference report for promise-stage rendering and downstream planning.",
    contentJson: {
      sections: [
        { key: "promise", title: "Promise", content: promiseBrief.promiseStatement },
        { key: "audience", title: "Audience", content: promiseBrief.audiencePrimary },
        { key: "truth", title: "Truth", content: promiseBrief.coreTruth },
        { key: "transformation", title: "Transformation", content: promiseBrief.transformationAfter },
        { key: "market", title: "Market", content: "Leadership teams navigating scale and operational complexity." },
        { key: "recommendations", title: "Recommendations", content: "Lead with a trust-first, systems-first operating model." },
      ],
    } satisfies Prisma.InputJsonValue,
    contentText: "Fixture promise report",
    modelName: "fixture",
  });
  await commitPromiseStageBundle(book.id);

  const outline = {
    workingTitle: "Systems of Influence",
    overview: "A practical leadership architecture for diagnosing and repairing the conditions that drive organizational influence.",
    structureRationale: "The book moves from problem diagnosis to framework, then into practical application.",
    readerTransformation: "Readers move from reactive management to structural leadership.",
    targetWordCount: 42000,
    readerJourneyMapping: [
      { phase: "Current Reality", sectionNumbers: [1], explanation: "Exposes the current leadership trap." },
      { phase: "Revelation", sectionNumbers: [2], explanation: "Introduces the structural framework." },
      { phase: "Application", sectionNumbers: [3], explanation: "Shows how to apply the model in teams." },
      { phase: "Transformation", sectionNumbers: [4], explanation: "Integrates the operating system into leadership identity." },
    ],
    wordCountVerification: {
      bookTargetWordCount: 42000,
      sectionWordCountTotal: 42000,
      chapterWordCountTotal: 42000,
      paragraphWordCountTotal: 42000,
      verified: true,
      notes: ["Fixture outline totals are internally consistent."],
    },
    sections: [
      {
        id: "section-1",
        number: 1,
        title: "The Cost of Compensating",
        bigIdea: "Most leadership exhaustion is a system smell, not a personal deficiency.",
        description: "Shows why smart leaders keep overworking to cover for organizational design failures.",
        whyThisSectionExists: "It names the hidden pattern before introducing the model.",
        whatItCovers: "Overcompensation, fragile alignment, and the illusion of control.",
        howItServesTheLargerStory: "It creates urgency for a structural answer.",
        readerJourneyPhases: ["Current Reality"],
        wordCountTarget: 9000,
        calculationDisplay: "2 chapters = 9000 words",
        chapters: [
          {
            id: "nf-ch1",
            number: 1,
            title: "The Leader Who Keeps Filling the Gap",
            bigIdea: "Leaders often absorb systemic friction until they mistake exhaustion for responsibility.",
            description: "Diagnoses the emotional and operational cost of filling every organizational gap personally.",
            whyThisChapterExists: "It creates recognition and emotional buy-in.",
            coreIdea: "Compensating is a warning signal, not a leadership virtue.",
            whatGetsConveyed: ["Compensation hides systemic weakness", "Effort can mask bad design"],
            storytellingTechnique: "Scene + framework",
            personasThatResonate: [{ audienceSegment: "Operators", whyThisResonates: "They live inside recurring organizational friction." }],
            voiceBlendEmphasis: { primary: "Strategic", reasoning: "Clear system diagnosis." },
            readerTransformationByEnd: "The reader recognizes their effort is being misapplied.",
            readerJourneyPhase: "Current Reality",
            wordCountTarget: 4500,
            calculationDisplay: "3 paragraphs = 4500 words",
            internalStructureLabel: "ME-WE-TRUTH",
            internalStructure: [],
            openingHook: "Open with the feeling of carrying a team uphill alone.",
            closingBridge: "Transition to why willpower cannot scale.",
            paragraphs: [],
          },
          {
            id: "nf-ch2",
            number: 2,
            title: "When Alignment Looks Real but Isn’t",
            bigIdea: "Surface agreement can hide weak trust and unclear ownership.",
            description: "Shows how polite consensus collapses under pressure when structural clarity is missing.",
            whyThisChapterExists: "It reframes alignment as a design outcome.",
            coreIdea: "Alignment must be built into the system, not inferred from meetings.",
            whatGetsConveyed: ["False alignment is common", "Systems need explicit reinforcement"],
            storytellingTechnique: "Pattern diagnosis",
            personasThatResonate: [{ audienceSegment: "Founders", whyThisResonates: "They see strategy degrade during execution." }],
            voiceBlendEmphasis: { primary: "Practical", reasoning: "Translate symptoms into operational insight." },
            readerTransformationByEnd: "The reader stops mistaking agreement for durable commitment.",
            readerJourneyPhase: "Current Reality",
            wordCountTarget: 4500,
            calculationDisplay: "3 paragraphs = 4500 words",
            internalStructureLabel: "WE-TRUTH-YOU",
            internalStructure: [],
            openingHook: "Start with a plan everyone agreed to that still unraveled.",
            closingBridge: "Bridge to the need for a repeatable model.",
            paragraphs: [],
          },
        ],
      },
    ],
    generationMeta: {
      source: "sonnet",
      model: "fixture",
      generatedAt: new Date().toISOString(),
    },
  } satisfies Prisma.InputJsonValue;

  await createOutlineVersion({
    bookId: book.id,
    title: "Outline",
    summary: "Committed outline architecture for nonfiction smoke.",
    contentJson: outline,
    contentText: JSON.stringify(outline, null, 2),
    modelName: "fixture",
  });

  const paragraphOutline = {
    workingTitle: "Systems of Influence",
    overview: "Paragraph-level blueprint for the nonfiction smoke fixture.",
    sections: [
      {
        sectionId: "section-1",
        sectionNumber: 1,
        sectionTitle: "The Cost of Compensating",
        sectionDescription: "Recognition of the system problem.",
        chapters: [
          {
            chapterId: "nf-ch1",
            chapterNumber: 1,
            chapterTitle: "The Leader Who Keeps Filling the Gap",
            chapterDescription: "Expose the cost of compensating.",
            chapterWordCountTarget: 1800,
            calculationDisplay: "3 paragraphs = 1800 words",
            structureLabel: "ME-WE-TRUTH",
            structureBlocks: [],
            paragraphs: [
              { id: "nf-ch1-p1", number: 1, topicSentence: "A leader becomes the system patch.", mainIdea: "The leader keeps covering recurring breakdowns personally.", purpose: "Create recognition.", contentType: "scene", wordCountTarget: 600, hook: "Start with the 6:12 a.m. Slack message.", structuralElement: "ME" },
              { id: "nf-ch1-p2", number: 2, topicSentence: "The pattern feels noble until it compounds.", mainIdea: "Compensation disguises the real failure.", purpose: "Show the hidden cost.", contentType: "framework", wordCountTarget: 600, hook: "Contrast urgency with structural neglect.", structuralElement: "WE" },
              { id: "nf-ch1-p3", number: 3, topicSentence: "Effort is not the same as influence.", mainIdea: "Leaders need to redesign conditions.", purpose: "Introduce the truth.", contentType: "insight", wordCountTarget: 600, hook: "Land the distinction sharply.", structuralElement: "TRUTH" },
            ],
          },
          {
            chapterId: "nf-ch2",
            chapterNumber: 2,
            chapterTitle: "When Alignment Looks Real but Isn’t",
            chapterDescription: "Show how false alignment breaks under pressure.",
            chapterWordCountTarget: 1900,
            calculationDisplay: "3 paragraphs = 1900 words",
            structureLabel: "WE-TRUTH-YOU",
            structureBlocks: [],
            paragraphs: [
              { id: "nf-ch2-p1", number: 1, topicSentence: "Everyone nodded in the meeting.", mainIdea: "Apparent alignment often lacks ownership.", purpose: "Expose the illusion.", contentType: "scene", wordCountTarget: 650, hook: "Use a meeting recap that later fails.", structuralElement: "WE" },
              { id: "nf-ch2-p2", number: 2, topicSentence: "Shared language is not shared commitment.", mainIdea: "Alignment needs trust and explicit reinforcement.", purpose: "Reframe the symptom.", contentType: "framework", wordCountTarget: 650, hook: "Explain why consensus is fragile.", structuralElement: "TRUTH" },
              { id: "nf-ch2-p3", number: 3, topicSentence: "Leaders must design visible ownership.", mainIdea: "System design creates durable alignment.", purpose: "Point toward application.", contentType: "application", wordCountTarget: 600, hook: "Show the operational implication.", structuralElement: "YOU" },
            ],
          },
        ],
      },
    ],
  } satisfies Prisma.InputJsonValue;

  await createOutlineExpansionVersion({
    bookId: book.id,
    title: "Paragraph Outline",
    summary: "Committed paragraph blueprint for nonfiction smoke.",
    contentJson: paragraphOutline,
    contentText: JSON.stringify(paragraphOutline, null, 2),
    modelName: "fixture",
  });
  await commitOutlineExpansionBundle(book.id);
  await commitOutlineStageBundle(book.id);

  const baseStory = {
    workingTitle: "Systems of Influence",
    selectedFormat: "GUIDE_JOURNEY",
    availableFormats: [
      {
        format: "GUIDE_JOURNEY",
        label: "Guide Journey",
        description: "The reader is guided through a clearer operating model.",
        bestFor: "Practical leadership books",
      },
    ],
    storyPremise: "A leader learns that sustainable influence comes from designing conditions, not performing authority.",
    bookThread: "Move from overcompensation to system stewardship.",
    bookMovement: {
      me: "The leader is overloaded.",
      we: "This pattern is common.",
      truth: "Influence is structural.",
      you: "Design conditions differently.",
      weClosing: "Teams can become trustworthy on purpose.",
    },
    chapters: [
      {
        chapterKey: "nf-ch1",
        chapterLabel: "Chapter 1: The Leader Who Keeps Filling the Gap",
        chapterPurpose: "Recognition",
        threadRole: "Expose the pain of compensation.",
        chapterStory: "A leader absorbs recurring friction until they realize the role itself is being used as a patch.",
        movement: {
          me: "The leader is stretched thin.",
          we: "Many leaders know this pattern.",
          truth: "Compensation signals a system issue.",
          you: "Look for the gap underneath the effort.",
          weClosing: "The pattern can be redesigned.",
        },
      },
      {
        chapterKey: "nf-ch2",
        chapterLabel: "Chapter 2: When Alignment Looks Real but Isn’t",
        chapterPurpose: "Reframe alignment",
        threadRole: "Show why meetings do not create commitment by themselves.",
        chapterStory: "A plan collapses because agreement never became shared ownership.",
        movement: {
          me: "The leader sees the unraveling.",
          we: "This happens across teams.",
          truth: "Alignment is designed, not assumed.",
          you: "Engineer explicit ownership.",
          weClosing: "Trust becomes visible when the system supports it.",
        },
      },
    ],
  } satisfies Prisma.InputJsonValue;

  await createBaseStoryVersion({
    bookId: book.id,
    title: "Base Story",
    summary: "Committed base story for nonfiction smoke.",
    contentJson: baseStory,
    contentText: JSON.stringify(baseStory, null, 2),
    modelName: "fixture",
  });
  await commitBaseStory(book.id);

  const personalStories = {
    interviewFocus: "Leadership moments that revealed the cost of compensating for broken systems.",
    nextQuestion: "What moment made you realize your team was depending on your effort instead of clear conditions?",
    entries: [
      {
        id: "ps-1",
        title: "The team update that never became ownership",
        summary: "A weekly status ritual masked missing accountability until a key launch slipped.",
        lesson: "Clarity without ownership is only temporary comfort.",
        whyItMatters: "It grounds the framework in lived operational pain.",
        storyType: "leadership",
        lifeArea: "Work",
        emotionalNotes: ["frustration", "clarity"],
        chapterFitHints: ["nf-ch2"],
        status: "strong",
        sourceQuote: "I kept restating the plan because nobody really owned it.",
      },
    ],
    noStoryTopics: [],
    coverageGaps: ["Need one origin story about learning to stop compensating personally."],
    interviewerNotes: ["Strong material for the alignment chapters."],
  } satisfies Prisma.InputJsonValue;

  await createPersonalStoriesArtifactVersion({
    bookId: book.id,
    artifactType: ArtifactType.PERSONAL_STORY_ENCYCLOPEDIA,
    title: "Personal Stories Encyclopedia",
    summary: "Committed personal stories fixture.",
    contentJson: personalStories,
    contentText: JSON.stringify(personalStories, null, 2),
    modelName: "fixture",
  });
  await commitPersonalStoriesStageBundle(book.id);

  const researchPacks = [
    {
      chapterKey: "nf-ch1",
      chapterTitle: "The Leader Who Keeps Filling the Gap",
      chapterDescription: "Expose the cost of compensating.",
      summary: "Research Pack: nf-ch1 - The Leader Who Keeps Filling the Gap",
      dossier: {
        chapterKey: "nf-ch1",
        chapterTitle: "The Leader Who Keeps Filling the Gap",
        chapterDescription: "Expose the cost of compensating.",
        researchGoal: "Ground the chapter in evidence that over-functioning leaders mask structural failure and burnout risk.",
        researchQuestions: [
          { id: "nf-ch1-rq1", question: "How does over-functioning change team behavior over time?", priority: "primary" },
        ],
        factBank: [
          {
            id: "nf-ch1-fact-1",
            itemType: "FACT",
            claimText: "Repeated rescue behavior trains teams to escalate uncertainty upward instead of resolving it locally.",
            evidenceExcerpt: "Managers who habitually step in become the default decision path, reducing local ownership.",
            summary: "Rescue behavior centralizes problem-solving and weakens ownership.",
            sourceId: "nf-ch1-src-1",
            sourceTier: "A",
            tierWeight: 1,
            verificationStatus: "VERIFIED",
            relevanceScore: 0.95,
            confidenceScore: 0.92,
            mappedChapterId: "nf-ch1",
          },
        ],
        statistics: [
          {
            id: "nf-ch1-stat-1",
            itemType: "STATISTIC",
            claimText: "Burnout risk rises when role ambiguity and constant interruption compound over time.",
            evidenceExcerpt: "Role ambiguity and high interruption frequency correlate with exhaustion and lower trust.",
            summary: "Operational ambiguity compounds fatigue.",
            sourceId: "nf-ch1-src-1",
            sourceTier: "A",
            tierWeight: 1,
            verificationStatus: "VERIFIED",
            relevanceScore: 0.88,
            confidenceScore: 0.86,
            mappedChapterId: "nf-ch1",
          },
        ],
        quotes: [],
        examples: [],
        counterpoints: [],
        definitions: [],
        gaps: [],
        sourceRegister: [
          {
            id: "nf-ch1-src-1",
            url: "https://example.com/leadership-overfunctioning",
            title: "Leadership Overfunctioning and Team Ownership",
            publisher: "Fixture Research Review",
            author: "GhostWritr Seed",
            publishedAt: "2026-01-15T00:00:00.000Z",
            accessedAt: new Date().toISOString(),
            contentType: "article",
            sourceTier: "A",
            tierWeight: 1,
            isVerified: true,
            verificationStatus: "VERIFIED",
          },
        ],
        verificationSummary: {
          totalSources: 1,
          verifiedSources: 1,
          totalItems: 2,
          verifiedItems: 2,
          rejectedItems: 0,
          needsCorroborationItems: 0,
        },
      },
    },
    {
      chapterKey: "nf-ch2",
      chapterTitle: "When Alignment Looks Real but Isn’t",
      chapterDescription: "Show how false alignment breaks under pressure.",
      summary: "Research Pack: nf-ch2 - When Alignment Looks Real but Isn’t",
      dossier: {
        chapterKey: "nf-ch2",
        chapterTitle: "When Alignment Looks Real but Isn’t",
        chapterDescription: "Show how false alignment breaks under pressure.",
        researchGoal: "Show why surface agreement collapses when ownership and feedback loops are weak.",
        researchQuestions: [
          { id: "nf-ch2-rq1", question: "Why does apparent alignment fail during execution?", priority: "primary" },
        ],
        factBank: [
          {
            id: "nf-ch2-fact-1",
            itemType: "FACT",
            claimText: "Teams often confuse shared language with shared commitment when ownership is not explicit.",
            evidenceExcerpt: "Agreement in meetings does not guarantee coordinated execution without defined accountability.",
            summary: "Shared words are not shared ownership.",
            sourceId: "nf-ch2-src-1",
            sourceTier: "A",
            tierWeight: 1,
            verificationStatus: "VERIFIED",
            relevanceScore: 0.96,
            confidenceScore: 0.9,
            mappedChapterId: "nf-ch2",
          },
        ],
        statistics: [],
        quotes: [],
        examples: [
          {
            id: "nf-ch2-example-1",
            itemType: "EXAMPLE",
            claimText: "Cross-functional plans degrade fastest when teams lack visible decision rights and escalation rules.",
            evidenceExcerpt: "Execution quality dropped when teams left planning meetings with unresolved ownership.",
            summary: "Operational clarity matters most after the meeting ends.",
            sourceId: "nf-ch2-src-1",
            sourceTier: "A",
            tierWeight: 1,
            verificationStatus: "VERIFIED",
            relevanceScore: 0.86,
            confidenceScore: 0.84,
            mappedChapterId: "nf-ch2",
          },
        ],
        counterpoints: [],
        definitions: [],
        gaps: [],
        sourceRegister: [
          {
            id: "nf-ch2-src-1",
            url: "https://example.com/alignment-ownership",
            title: "Alignment, Ownership, and Execution Drift",
            publisher: "Fixture Research Review",
            author: "GhostWritr Seed",
            publishedAt: "2026-01-20T00:00:00.000Z",
            accessedAt: new Date().toISOString(),
            contentType: "article",
            sourceTier: "A",
            tierWeight: 1,
            isVerified: true,
            verificationStatus: "VERIFIED",
          },
        ],
        verificationSummary: {
          totalSources: 1,
          verifiedSources: 1,
          totalItems: 2,
          verifiedItems: 2,
          rejectedItems: 0,
          needsCorroborationItems: 0,
        },
      },
    },
  ];

  for (const pack of researchPacks) {
    await createResearchPackVersion({
      bookId: book.id,
      chapterKey: pack.chapterKey,
      chapterTitle: pack.chapterTitle,
      summary: pack.summary,
      dossier: pack.dossier as never,
      sources: pack.dossier.sourceRegister as never,
      items: [...pack.dossier.factBank, ...pack.dossier.statistics, ...pack.dossier.examples] as never,
      verifications: [],
      modelName: "fixture",
    });
    await commitResearchPack(book.id, pack.chapterKey);
  }

  await updateStageForBook(book.id, StageKey.RESEARCH, {
    status: StageStatus.COMMITTED,
    committedAt: new Date(),
    metadataJson: {
      automationStatus: "fixture_committed",
      completedChapters: researchPacks.length,
      totalChapters: researchPacks.length,
    } satisfies Prisma.InputJsonValue,
  });

  const externalStoryPacks = [
    {
      chapterKey: "nf-ch1",
      chapterTitle: "The Leader Who Keeps Filling the Gap",
      chapterDescription: "Expose the cost of compensating.",
      summary: "External Stories: nf-ch1 - The Leader Who Keeps Filling the Gap",
      dossier: {
        chapterKey: "nf-ch1",
        chapterTitle: "The Leader Who Keeps Filling the Gap",
        chapterDescription: "Expose the cost of compensating.",
        storyGoal: "Provide a concrete outside example of a leader becoming the system patch.",
        storyCandidates: [
          {
            id: "nf-ch1-story-1",
            sourceId: "nf-ch1-story-src-1",
            title: "The COO who became the escalation desk",
            summary: "A scaling operator spent every morning resolving issues that should have been handled inside the line.",
            whyItMatters: "Shows how rescue work can look noble while weakening the system.",
            emotionalRole: "Recognition with unease",
            storyType: "FAILURE",
            storyFit: "OPENING_HOOK",
            leadershipTheme: "Over-functioning leadership",
            sourceTier: "A",
            tierWeight: 1,
            verificationStatus: "VERIFIED",
          },
        ],
        sourceRegister: [
          {
            id: "nf-ch1-story-src-1",
            url: "https://example.com/coo-escalation-desk",
            title: "The COO Who Became the Escalation Desk",
            publisher: "Fixture Stories Review",
            author: "GhostWritr Seed",
            publishedAt: "2026-02-03T00:00:00.000Z",
            accessedAt: new Date().toISOString(),
            contentType: "case-study",
            sourceTier: "A",
            tierWeight: 1,
            isVerified: true,
            verificationStatus: "VERIFIED",
          },
        ],
        storyTypesCovered: ["FAILURE"],
        storyFitsCovered: ["OPENING_HOOK"],
        verificationSummary: {
          totalSources: 1,
          verifiedSources: 1,
          totalStories: 1,
          verifiedStories: 1,
          rejectedStories: 0,
          needsCorroborationStories: 0,
        },
      },
    },
    {
      chapterKey: "nf-ch2",
      chapterTitle: "When Alignment Looks Real but Isn’t",
      chapterDescription: "Show how false alignment breaks under pressure.",
      summary: "External Stories: nf-ch2 - When Alignment Looks Real but Isn’t",
      dossier: {
        chapterKey: "nf-ch2",
        chapterTitle: "When Alignment Looks Real but Isn’t",
        chapterDescription: "Show how false alignment breaks under pressure.",
        storyGoal: "Provide a concrete example of agreement collapsing because ownership remained ambiguous.",
        storyCandidates: [
          {
            id: "nf-ch2-story-1",
            sourceId: "nf-ch2-story-src-1",
            title: "The offsite that produced no owner",
            summary: "A team left a strategy offsite enthusiastic, then missed the launch because nobody owned the hard tradeoffs.",
            whyItMatters: "Shows that synchronized language can still hide fragmented responsibility.",
            emotionalRole: "Recognition and caution",
            storyType: "DECISION_UNDER_PRESSURE",
            storyFit: "PROOF_POINT",
            leadershipTheme: "Execution drift",
            sourceTier: "A",
            tierWeight: 1,
            verificationStatus: "VERIFIED",
          },
        ],
        sourceRegister: [
          {
            id: "nf-ch2-story-src-1",
            url: "https://example.com/offsite-no-owner",
            title: "The Offsite That Produced No Owner",
            publisher: "Fixture Stories Review",
            author: "GhostWritr Seed",
            publishedAt: "2026-02-10T00:00:00.000Z",
            accessedAt: new Date().toISOString(),
            contentType: "case-study",
            sourceTier: "A",
            tierWeight: 1,
            isVerified: true,
            verificationStatus: "VERIFIED",
          },
        ],
        storyTypesCovered: ["DECISION_UNDER_PRESSURE"],
        storyFitsCovered: ["PROOF_POINT"],
        verificationSummary: {
          totalSources: 1,
          verifiedSources: 1,
          totalStories: 1,
          verifiedStories: 1,
          rejectedStories: 0,
          needsCorroborationStories: 0,
        },
      },
    },
  ];

  for (const pack of externalStoryPacks) {
    await createExternalStoryPackVersion({
      bookId: book.id,
      chapterKey: pack.chapterKey,
      chapterTitle: pack.chapterTitle,
      summary: pack.summary,
      dossier: pack.dossier as never,
      sources: pack.dossier.sourceRegister as never,
      stories: pack.dossier.storyCandidates as never,
      verifications: [],
      modelName: "fixture",
    });
    await commitExternalStoryPack(book.id, pack.chapterKey);
  }

  await updateStageForBook(book.id, StageKey.EXTERNAL_STORIES, {
    status: StageStatus.COMMITTED,
    committedAt: new Date(),
    metadataJson: {
      automationStatus: "fixture_committed",
      completedChapters: externalStoryPacks.length,
      totalChapters: externalStoryPacks.length,
    } satisfies Prisma.InputJsonValue,
  });

  await runChapterDraftWorkflow(slug);
  await commitAllChapterDraftsWorkflow(slug);

  const assembly = await assembleManuscriptWorkflow(slug);
  await updateStageForBook(book.id, StageKey.EDITING, {
    status: StageStatus.READY_FOR_REVIEW,
    metadataJson: {
      automationStatus: "ready_for_review",
      assembledAt: assembly.assembledAt,
      totalWords: assembly.totalWords,
      chapterCount: assembly.chapterCount,
    } satisfies Prisma.InputJsonValue,
  });
  await preparePublishingPackageWorkflow(slug);

  console.log(`[seed] nonfiction fixture ready: ${slug}`);
}

async function seedFictionSmoke() {
  const slug = "fiction-smoke";
  await resetFixtureBook(slug);

  const book = await createBookWithStages({
    slug,
    titleWorking: "Fiction Smoke",
    workflowType: BookWorkflowType.FICTION,
    metadataJson: {
      fixture: true,
      purpose: "fiction regression smoke",
    } satisfies Prisma.InputJsonValue,
  });

  await createBookSetupVersion({
    bookId: book.id,
    profile: {
      workingTitle: "Fiction Smoke",
      subtitle: null,
      writerPersona: "Literary Suspense Ghostwriter",
      baseStoryFormatPreference: "HERO_JOURNEY",
      voiceReferenceNotes: ["Literary suspense", "Close emotional tension", "Elegant momentum"],
      targetWordCount: 70000,
      wordCountTolerance: 5000,
      targetPageCount: 300,
      trimSize: "6 x 9 in",
      outputFormats: ["PRINT", "EBOOK"],
      aiAuthorshipGuardEnabled: true,
      provenanceTrackingEnabled: true,
      marketingHandoffEnabled: true,
      notesToSystem: ["Keep scenes intimate and psychologically charged."],
    },
  });
  await commitBookSetup(book.id);

  const fictionArtifacts = [
    {
      stageKey: StageKey.STORY_SETUP,
      artifactType: ArtifactType.STORY_SETUP_PROFILE,
      title: "Story Setup",
      summary: "Core fiction setup for smoke fixture.",
      contentJson: {
        summary: "A literary suspense novel about inheritance, conspiracy, and consent.",
        premise: "A burned-out strategist discovers a hidden inheritance that pulls her into a family conspiracy.",
        genre: "Literary Suspense",
        subgenre: "Family intrigue",
        targetAudience: "Readers who like quiet tension and moral complexity.",
        tone: "Elegant, tense, intimate",
        pointOfView: "Close third person",
        tense: "Past",
        targetLength: "70,000 words",
        comparableTitles: ["The Nest", "The Last Thing He Told Me"],
        storyQuestion: "What happens when the system protecting you is the thing consuming you?",
        authorIntent: "Write a tense inheritance drama about truth and complicity.",
      },
    },
    {
      stageKey: StageKey.STORY_CORE,
      artifactType: ArtifactType.STORY_CORE_BIBLE,
      title: "Story Core",
      summary: "Theme and conflict for smoke fixture.",
      contentJson: {
        summary: "The novel explores whether comfort purchased through silence is worth the cost.",
        theme: "Truth costs more than comfort.",
        controllingIdea: "A person becomes free only after naming the system that benefits from her silence.",
        protagonist: "Elena Ward",
        protagonistNeed: "To stop outsourcing her moral judgment to family systems.",
        antagonistForce: "A family apparatus that disguises coercion as protection.",
        centralConflict: "Elena must expose the family system that protects her while it destroys everyone she loves.",
        stakes: "If she stays silent, she inherits safety and loses herself.",
        transformationArc: "From compliant strategist to self-authoring truth teller.",
        storyPromise: "A family inheritance becomes the doorway into a conspiracy of consent.",
      },
    },
    {
      stageKey: StageKey.WORLD_CAST,
      artifactType: ArtifactType.WORLD_CAST_BIBLE,
      title: "World & Cast",
      summary: "World and cast for smoke fixture.",
      contentJson: {
        summary: "A coastal family empire built on elegance, omission, and control.",
        setting: "An old-money coastal estate and private club network in New England.",
        worldRules: ["Power is exercised through implication, not direct force.", "Family loyalty is rewarded only when it remains silent."],
        atmosphere: "Salt air, moneyed restraint, and curated memory.",
        institutions: ["Ward family office", "Marina club", "Estate legal network"],
        characters: [
          {
            name: "Elena Ward",
            role: "Protagonist",
            desire: "To understand what her mother left behind.",
            flaw: "She over-trusts systems that appear orderly.",
            pressure: "The family needs her compliance to keep its secrets buried.",
            relationshipNotes: "Estranged from the family but still marked by its codes.",
          },
          {
            name: "Julian Ward",
            role: "Primary pressure source",
            desire: "To keep the inheritance story controlled.",
            flaw: "He confuses stewardship with entitlement.",
            pressure: "Exposure would collapse both his identity and influence.",
            relationshipNotes: "Cousin and elegant manipulator.",
          },
        ],
      },
    },
    {
      stageKey: StageKey.PLOT_BLUEPRINT,
      artifactType: ArtifactType.FICTION_PLOT_BLUEPRINT,
      title: "Plot Blueprint",
      summary: "Chapter beats for smoke fixture.",
      contentJson: {
        summary: "A short act structure for smoke verification.",
        structureModel: "Two-act intrigue arc",
        actSummaries: ["Inheritance summons Elena home.", "The family story fractures under pressure."],
        turningPoints: ["Elena receives the inheritance summons.", "A hidden key reveals the first lie."],
        chapterBeats: [
          {
            chapterNumber: 1,
            title: "The Summons",
            beat: "Elena is called home to receive an inheritance with conditions.",
            pointOfView: "Elena",
            purpose: "Trigger the return and establish suspicion.",
            conflict: "Elena must return to a system she distrusts.",
            turn: "She notices evidence that the family story has been edited.",
            hook: "A portrait has been removed from the wall.",
            targetWords: 2200,
          },
          {
            chapterNumber: 2,
            title: "The Marina Dinner",
            beat: "Julian stages a dinner to measure what Elena knows.",
            pointOfView: "Elena",
            purpose: "Escalate social pressure and conspiracy.",
            conflict: "She must survive the performance without showing her hand.",
            turn: "A brass key changes the dinner from theater to threat.",
            hook: "A hand places a key into her palm beneath the table.",
            targetWords: 2400,
          },
        ],
      },
    },
    {
      stageKey: StageKey.SCENE_PLAN,
      artifactType: ArtifactType.FICTION_SCENE_PLAN,
      title: "Scene Plan",
      summary: "Scene cards for smoke fixture.",
      contentJson: {
        summary: "Two chapters, four scenes, and clear continuity.",
        continuityRules: ["Elena notices detail before she names its meaning.", "The family never states the threat directly."],
        chapters: [
          {
            chapterNumber: 1,
            title: "The Summons",
            pointOfView: "Elena",
            purpose: "Re-enter the family system",
            summary: "Elena receives the call, returns home, and sees the first sign of editorial manipulation.",
            targetWords: 2200,
            scenes: [
              {
                sceneNumber: 1,
                title: "The Call",
                location: "Elena's apartment",
                pointOfView: "Elena",
                objective: "Understand why the family lawyer is calling.",
                conflict: "The family is summoning her back on its own terms.",
                outcome: "She learns there is an inheritance with conditions.",
                reveal: "Her mother left something behind.",
                bridge: "She boards the train north.",
              },
              {
                sceneNumber: 2,
                title: "The Hallway",
                location: "Ward estate",
                pointOfView: "Elena",
                objective: "Assess the family terrain on arrival.",
                conflict: "Every surface is curated to keep her off-balance.",
                outcome: "She notices the missing portrait.",
                reveal: "Someone edited the visible family story.",
                bridge: "She prepares for dinner with Julian.",
              },
            ],
          },
          {
            chapterNumber: 2,
            title: "The Marina Dinner",
            pointOfView: "Elena",
            purpose: "Escalate the pressure",
            summary: "Julian tests Elena socially while an ally quietly signals danger.",
            targetWords: 2400,
            scenes: [
              {
                sceneNumber: 1,
                title: "The Seating Chart",
                location: "Marina club",
                pointOfView: "Elena",
                objective: "Read the room before Julian makes his move.",
                conflict: "Every smile is a probe.",
                outcome: "Elena realizes the dinner is staged.",
                reveal: "The room expects her compliance.",
                bridge: "Julian stands to toast their mother.",
              },
              {
                sceneNumber: 2,
                title: "The Key",
                location: "Marina club dining room",
                pointOfView: "Elena",
                objective: "Stay composed while the family reframes the past.",
                conflict: "The public performance erases her mother's truth.",
                outcome: "A cousin slips her a brass key.",
                reveal: "The danger lies inside the family's hidden archive.",
                bridge: "Elena leaves knowing the conspiracy is active.",
              },
            ],
          },
        ],
      },
    },
  ];

  for (const artifact of fictionArtifacts) {
    await createFictionArtifactVersion({
      bookId: book.id,
      stageKey: artifact.stageKey,
      artifactType: artifact.artifactType,
      title: artifact.title,
      summary: artifact.summary,
      contentJson: artifact.contentJson as Prisma.InputJsonValue,
      contentText: JSON.stringify(artifact.contentJson, null, 2),
      modelName: "fixture",
    });
    await commitFictionArtifact(book.id, artifact.stageKey, artifact.artifactType);
  }

  const scenePlan = fictionArtifacts.find((artifact) => artifact.stageKey === StageKey.SCENE_PLAN)?.contentJson;
  const chapters = Array.isArray((scenePlan as { chapters?: unknown[] } | undefined)?.chapters)
    ? ((scenePlan as unknown as { chapters: Array<{ chapterNumber: number }> }).chapters)
    : [];

  for (const chapter of chapters) {
    await generateFictionDraftChapterWorkflow(slug, chapter.chapterNumber);
  }

  await commitFictionStageWorkflow(slug, StageKey.FICTION_DRAFT);

  const assembly = await assembleManuscriptWorkflow(slug);
  await updateStageForBook(book.id, StageKey.EDITING, {
    status: StageStatus.READY_FOR_REVIEW,
    metadataJson: {
      automationStatus: "ready_for_review",
      assembledAt: assembly.assembledAt,
      totalWords: assembly.totalWords,
      chapterCount: assembly.chapterCount,
    } satisfies Prisma.InputJsonValue,
  });
  await preparePublishingPackageWorkflow(slug);

  console.log(`[seed] fiction fixture ready: ${slug}`);
}

async function main() {
  await seedNonfictionSmoke();
  await seedFictionSmoke();
  console.log("[seed] reference books complete");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
