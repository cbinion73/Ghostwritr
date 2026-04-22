-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StageKey" AS ENUM ('BOOK_SETUP', 'PROMISE', 'AUDIENCE', 'MARKET_ANALYSIS', 'OUTLINE', 'BASE_STORY', 'RESEARCH', 'EXTERNAL_STORIES', 'PERSONAL_STORIES', 'CHAPTER_DRAFT', 'EDITING');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'COMMITTED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ArtifactType" AS ENUM ('BOOK_SETUP_PROFILE', 'PROMISE_BRIEF', 'PROMISE_CHAT', 'PERSONA_PACK', 'MARKET_REPORT', 'POSITIONING_RECOMMENDATIONS', 'PROMISE_SCORECARD', 'AUDIENCE_RESEARCH', 'CORE_TRUTHS', 'TRANSFORMATION_ARC', 'BOOK_PROMISE_REPORT', 'OUTLINE', 'OUTLINE_EXPANSION', 'CHAPTER_PARAGRAPH_PLAN', 'BASE_STORY', 'RESEARCH_PACK', 'STORY_PACK', 'EXTERNAL_STORY_PACK', 'PERSONAL_STORY_CHAT', 'PERSONAL_STORY_ENCYCLOPEDIA', 'CHAPTER_DRAFT', 'EDITORIAL_REVIEW', 'AI_VOICE_REVIEW', 'MANUSCRIPT_ASSEMBLY', 'LENGTH_ADJUSTMENT', 'PUBLISHING_PACKAGE', 'MARKETING_HANDOFF_PACKAGE', 'PROVENANCE_REPORT');

-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('DRAFT', 'REVIEW_READY', 'COMMITTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DecisionType" AS ENUM ('ACCEPT', 'REJECT', 'REQUEST_REVISION', 'COMMIT', 'REOPEN');

-- CreateEnum
CREATE TYPE "WorkflowRunType" AS ENUM ('PROMISE_CONVERSATION', 'PROMISE_EXTRACTION', 'PROMISE_SCORING', 'PERSONA_ANALYSIS', 'MARKET_ANALYSIS', 'POSITIONING_RECOMMENDATIONS', 'GENERAL');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SourceDocumentCategory" AS ENUM ('PROMPT_ARCHIVE', 'COMMUNICATION_FRAMEWORK', 'USER_UPLOAD', 'RESEARCH_REFERENCE', 'GENERATED_EXPORT', 'GENERATED_SNAPSHOT');

-- CreateEnum
CREATE TYPE "SourceDocumentType" AS ENUM ('FILE', 'WEB_PAGE', 'GENERATED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'MODEL');

-- CreateEnum
CREATE TYPE "ResearchSourceTier" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "ResearchVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'NEEDS_CORROBORATION');

-- CreateEnum
CREATE TYPE "ResearchVerifierType" AS ENUM ('FETCH_VALIDATOR', 'LLM_VERIFIER', 'HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "ResearchItemType" AS ENUM ('FACT', 'STATISTIC', 'QUOTE', 'EXAMPLE', 'CASE_STUDY', 'COUNTERPOINT', 'DEFINITION');

-- CreateEnum
CREATE TYPE "StorySourceTier" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "StoryVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'NEEDS_CORROBORATION');

-- CreateEnum
CREATE TYPE "StoryVerifierType" AS ENUM ('FETCH_VALIDATOR', 'LLM_VERIFIER', 'HUMAN_REVIEW');

-- CreateEnum
CREATE TYPE "ExternalStoryType" AS ENUM ('ORIGIN', 'TURNING_POINT', 'FAILURE', 'RECOVERY', 'DECISION_UNDER_PRESSURE', 'INNOVATION', 'CULTURE', 'CREDIBILITY', 'CONTRADICTION', 'MORAL', 'LEGACY', 'MICRO_STORY');

-- CreateEnum
CREATE TYPE "ExternalStoryFit" AS ENUM ('OPENING_HOOK', 'CHAPTER_PIVOT', 'PROOF_POINT', 'EMOTIONAL_RELEASE', 'CLOSING_RESONANCE', 'MARKETING_REUSE');

-- CreateEnum
CREATE TYPE "BaseStoryFormat" AS ENUM ('PARABLE', 'HERO_JOURNEY', 'GUIDE_JOURNEY', 'COMPOSITE_CHARACTER', 'CASE_JOURNEY', 'MOSAIC_VIGNETTES', 'QUEST', 'RISE_FALL_REDEMPTION', 'LETTER_FRAME', 'FIELD_MANUAL_NARRATIVE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriterPersona" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "voiceTraitsJson" JSONB NOT NULL DEFAULT '[]',
    "signaturePatternsJson" JSONB NOT NULL DEFAULT '[]',
    "avoidPatternsJson" JSONB NOT NULL DEFAULT '[]',
    "frameworkFlowJson" JSONB NOT NULL DEFAULT '[]',
    "frameworkName" TEXT,
    "sampleExcerpt" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WriterPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WriterPersonaSample" (
    "id" UUID NOT NULL,
    "writerPersonaId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "note" TEXT,
    "originalFileName" TEXT,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "useForInspiration" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WriterPersonaSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Book" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "titleWorking" TEXT,
    "subtitle" TEXT,
    "status" "BookStatus" NOT NULL DEFAULT 'DRAFT',
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "ownerUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookStage" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageKey" "StageKey" NOT NULL,
    "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "activeArtifactVersionId" UUID,
    "committedArtifactVersionId" UUID,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "committedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectionEvent" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "artifactId" UUID,
    "eventType" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorUserId" UUID,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Artifact" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "artifactType" "ArtifactType" NOT NULL,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" UUID,
    "committedVersionId" UUID,
    "title" TEXT,
    "summary" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArtifactVersion" (
    "id" UUID NOT NULL,
    "artifactId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "lifecycleState" "ArtifactStatus" NOT NULL DEFAULT 'DRAFT',
    "contentJson" JSONB NOT NULL DEFAULT '{}',
    "contentText" TEXT,
    "summary" TEXT,
    "createdByType" "ActorType" NOT NULL,
    "createdByUserId" UUID,
    "workflowRunId" UUID,
    "basedOnVersionIdsJson" JSONB NOT NULL DEFAULT '[]',
    "promptTemplateVersion" TEXT,
    "modelName" TEXT,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "artifactId" UUID,
    "decisionType" "DecisionType" NOT NULL,
    "decisionValue" TEXT NOT NULL,
    "notes" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "runType" "WorkflowRunType" NOT NULL DEFAULT 'GENERAL',
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'QUEUED',
    "inputJson" JSONB NOT NULL DEFAULT '{}',
    "outputJson" JSONB NOT NULL DEFAULT '{}',
    "errorText" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" UUID NOT NULL,
    "bookId" UUID,
    "category" "SourceDocumentCategory" NOT NULL,
    "sourceType" "SourceDocumentType" NOT NULL DEFAULT 'FILE',
    "title" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "extractedText" TEXT,
    "embeddingState" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchSource" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "researchArtifactVersionId" UUID,
    "chapterKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "title" TEXT NOT NULL,
    "publisher" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentType" TEXT,
    "sourceTier" "ResearchSourceTier" NOT NULL,
    "tierWeight" DECIMAL(4,2) NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "ResearchVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationNotes" TEXT,
    "snapshotPath" TEXT,
    "extractedTextPath" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchItem" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "researchArtifactVersionId" UUID,
    "sourceRecordId" UUID NOT NULL,
    "chapterKey" TEXT NOT NULL,
    "itemType" "ResearchItemType" NOT NULL,
    "claimText" TEXT NOT NULL,
    "evidenceExcerpt" TEXT,
    "summary" TEXT,
    "sourceTier" "ResearchSourceTier" NOT NULL,
    "tierWeight" DECIMAL(4,2) NOT NULL,
    "verificationStatus" "ResearchVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedByRunId" UUID,
    "relevanceScore" DECIMAL(4,2),
    "confidenceScore" DECIMAL(4,2),
    "mappedSectionId" TEXT,
    "mappedChapterId" TEXT,
    "mappedParagraphId" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchVerification" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "chapterKey" TEXT NOT NULL,
    "sourceRecordId" UUID,
    "researchItemId" UUID,
    "verifierType" "ResearchVerifierType" NOT NULL,
    "status" "ResearchVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "titleMatch" BOOLEAN,
    "contentMatch" BOOLEAN,
    "claimSupported" BOOLEAN,
    "tierConfirmed" BOOLEAN,
    "secondSourceRequired" BOOLEAN NOT NULL DEFAULT false,
    "secondSourceConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchBinderTab" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "chapterKeysJson" JSONB NOT NULL DEFAULT '[]',
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchBinderTab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchIdeaClip" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "binderTabId" UUID NOT NULL,
    "chapterKey" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchIdeaClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalStoryBinderTab" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "chapterKeysJson" JSONB NOT NULL DEFAULT '[]',
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalStoryBinderTab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalStoryClip" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "binderTabId" UUID NOT NULL,
    "chapterKey" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalStoryClip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalStorySource" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "storyArtifactVersionId" UUID,
    "chapterKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "title" TEXT NOT NULL,
    "publisher" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentType" TEXT,
    "sourceTier" "StorySourceTier" NOT NULL,
    "tierWeight" DECIMAL(4,2) NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationStatus" "StoryVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationNotes" TEXT,
    "snapshotPath" TEXT,
    "extractedTextPath" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalStorySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalStoryItem" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "storyArtifactVersionId" UUID,
    "sourceRecordId" UUID NOT NULL,
    "chapterKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "emotionalRole" TEXT NOT NULL,
    "storyType" "ExternalStoryType" NOT NULL,
    "storyFit" "ExternalStoryFit" NOT NULL,
    "leadershipTheme" TEXT,
    "sourceTier" "StorySourceTier" NOT NULL,
    "tierWeight" DECIMAL(4,2) NOT NULL,
    "verificationStatus" "StoryVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "mappedSectionId" TEXT,
    "mappedChapterId" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalStoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalStoryVerification" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "stageId" UUID NOT NULL,
    "chapterKey" TEXT NOT NULL,
    "sourceRecordId" UUID,
    "externalStoryId" UUID,
    "verifierType" "StoryVerifierType" NOT NULL,
    "status" "StoryVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "titleMatch" BOOLEAN,
    "contentMatch" BOOLEAN,
    "claimSupported" BOOLEAN,
    "secondSourceRequired" BOOLEAN NOT NULL DEFAULT false,
    "secondSourceConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "metadataJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalStoryVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorProfile" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "displayName" TEXT NOT NULL,
    "backgroundSummary" TEXT,
    "expertise" JSONB NOT NULL DEFAULT '[]',
    "targetAudience" TEXT,
    "tonePreference" TEXT,
    "proseStyle" TEXT,
    "preferredMetaphors" JSONB NOT NULL DEFAULT '[]',
    "avoidPatterns" JSONB NOT NULL DEFAULT '[]',
    "mustInclude" JSONB NOT NULL DEFAULT '[]',
    "brandVoice" TEXT,
    "characterNames" JSONB NOT NULL DEFAULT '[]',
    "terminology" JSONB NOT NULL DEFAULT '[]',
    "recurringMetaphors" JSONB NOT NULL DEFAULT '[]',
    "styleGuideNotes" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "WriterPersona_slug_key" ON "WriterPersona"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "WriterPersona_name_key" ON "WriterPersona"("name");

-- CreateIndex
CREATE INDEX "WriterPersonaSample_writerPersonaId_useForInspiration_creat_idx" ON "WriterPersonaSample"("writerPersonaId", "useForInspiration", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Book_slug_key" ON "Book"("slug");

-- CreateIndex
CREATE INDEX "BookStage_bookId_stageKey_idx" ON "BookStage"("bookId", "stageKey");

-- CreateIndex
CREATE UNIQUE INDEX "BookStage_bookId_stageKey_key" ON "BookStage"("bookId", "stageKey");

-- CreateIndex
CREATE INDEX "DirectionEvent_bookId_stageId_createdAt_idx" ON "DirectionEvent"("bookId", "stageId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectionEvent_eventType_actorType_idx" ON "DirectionEvent"("eventType", "actorType");

-- CreateIndex
CREATE INDEX "Artifact_bookId_stageId_artifactType_idx" ON "Artifact"("bookId", "stageId", "artifactType");

-- CreateIndex
CREATE INDEX "ArtifactVersion_artifactId_lifecycleState_idx" ON "ArtifactVersion"("artifactId", "lifecycleState");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactVersion_artifactId_versionNumber_key" ON "ArtifactVersion"("artifactId", "versionNumber");

-- CreateIndex
CREATE INDEX "Decision_bookId_stageId_createdAt_idx" ON "Decision"("bookId", "stageId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_bookId_stageId_status_idx" ON "WorkflowRun"("bookId", "stageId", "status");

-- CreateIndex
CREATE INDEX "SourceDocument_bookId_category_idx" ON "SourceDocument"("bookId", "category");

-- CreateIndex
CREATE INDEX "ResearchSource_bookId_stageId_chapterKey_idx" ON "ResearchSource"("bookId", "stageId", "chapterKey");

-- CreateIndex
CREATE INDEX "ResearchSource_researchArtifactVersionId_idx" ON "ResearchSource"("researchArtifactVersionId");

-- CreateIndex
CREATE INDEX "ResearchSource_sourceTier_verificationStatus_idx" ON "ResearchSource"("sourceTier", "verificationStatus");

-- CreateIndex
CREATE INDEX "ResearchItem_bookId_stageId_chapterKey_idx" ON "ResearchItem"("bookId", "stageId", "chapterKey");

-- CreateIndex
CREATE INDEX "ResearchItem_researchArtifactVersionId_idx" ON "ResearchItem"("researchArtifactVersionId");

-- CreateIndex
CREATE INDEX "ResearchItem_sourceRecordId_verificationStatus_idx" ON "ResearchItem"("sourceRecordId", "verificationStatus");

-- CreateIndex
CREATE INDEX "ResearchVerification_bookId_stageId_chapterKey_idx" ON "ResearchVerification"("bookId", "stageId", "chapterKey");

-- CreateIndex
CREATE INDEX "ResearchVerification_sourceRecordId_idx" ON "ResearchVerification"("sourceRecordId");

-- CreateIndex
CREATE INDEX "ResearchVerification_researchItemId_idx" ON "ResearchVerification"("researchItemId");

-- CreateIndex
CREATE INDEX "ResearchVerification_status_verifierType_idx" ON "ResearchVerification"("status", "verifierType");

-- CreateIndex
CREATE INDEX "ResearchBinderTab_bookId_stageId_isArchived_orderIndex_idx" ON "ResearchBinderTab"("bookId", "stageId", "isArchived", "orderIndex");

-- CreateIndex
CREATE INDEX "ResearchIdeaClip_bookId_stageId_binderTabId_orderIndex_idx" ON "ResearchIdeaClip"("bookId", "stageId", "binderTabId", "orderIndex");

-- CreateIndex
CREATE INDEX "ExternalStoryBinderTab_bookId_stageId_isArchived_orderIndex_idx" ON "ExternalStoryBinderTab"("bookId", "stageId", "isArchived", "orderIndex");

-- CreateIndex
CREATE INDEX "ExternalStoryClip_bookId_stageId_binderTabId_orderIndex_idx" ON "ExternalStoryClip"("bookId", "stageId", "binderTabId", "orderIndex");

-- CreateIndex
CREATE INDEX "ExternalStorySource_bookId_stageId_chapterKey_idx" ON "ExternalStorySource"("bookId", "stageId", "chapterKey");

-- CreateIndex
CREATE INDEX "ExternalStorySource_storyArtifactVersionId_idx" ON "ExternalStorySource"("storyArtifactVersionId");

-- CreateIndex
CREATE INDEX "ExternalStorySource_sourceTier_verificationStatus_idx" ON "ExternalStorySource"("sourceTier", "verificationStatus");

-- CreateIndex
CREATE INDEX "ExternalStoryItem_bookId_stageId_chapterKey_idx" ON "ExternalStoryItem"("bookId", "stageId", "chapterKey");

-- CreateIndex
CREATE INDEX "ExternalStoryItem_storyArtifactVersionId_idx" ON "ExternalStoryItem"("storyArtifactVersionId");

-- CreateIndex
CREATE INDEX "ExternalStoryItem_sourceRecordId_verificationStatus_idx" ON "ExternalStoryItem"("sourceRecordId", "verificationStatus");

-- CreateIndex
CREATE INDEX "ExternalStoryVerification_bookId_stageId_chapterKey_idx" ON "ExternalStoryVerification"("bookId", "stageId", "chapterKey");

-- CreateIndex
CREATE INDEX "ExternalStoryVerification_sourceRecordId_idx" ON "ExternalStoryVerification"("sourceRecordId");

-- CreateIndex
CREATE INDEX "ExternalStoryVerification_externalStoryId_idx" ON "ExternalStoryVerification"("externalStoryId");

-- CreateIndex
CREATE INDEX "ExternalStoryVerification_status_verifierType_idx" ON "ExternalStoryVerification"("status", "verifierType");

-- CreateIndex
CREATE INDEX "AuthorProfile_userId_idx" ON "AuthorProfile"("userId");

-- CreateIndex
CREATE INDEX "AuthorProfile_isDefault_idx" ON "AuthorProfile"("isDefault");

-- AddForeignKey
ALTER TABLE "WriterPersonaSample" ADD CONSTRAINT "WriterPersonaSample_writerPersonaId_fkey" FOREIGN KEY ("writerPersonaId") REFERENCES "WriterPersona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookStage" ADD CONSTRAINT "BookStage_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectionEvent" ADD CONSTRAINT "DirectionEvent_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectionEvent" ADD CONSTRAINT "DirectionEvent_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectionEvent" ADD CONSTRAINT "DirectionEvent_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectionEvent" ADD CONSTRAINT "DirectionEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchSource" ADD CONSTRAINT "ResearchSource_researchArtifactVersionId_fkey" FOREIGN KEY ("researchArtifactVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchItem" ADD CONSTRAINT "ResearchItem_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchItem" ADD CONSTRAINT "ResearchItem_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchItem" ADD CONSTRAINT "ResearchItem_researchArtifactVersionId_fkey" FOREIGN KEY ("researchArtifactVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchItem" ADD CONSTRAINT "ResearchItem_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "ResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchVerification" ADD CONSTRAINT "ResearchVerification_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchVerification" ADD CONSTRAINT "ResearchVerification_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchVerification" ADD CONSTRAINT "ResearchVerification_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "ResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchVerification" ADD CONSTRAINT "ResearchVerification_researchItemId_fkey" FOREIGN KEY ("researchItemId") REFERENCES "ResearchItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchBinderTab" ADD CONSTRAINT "ResearchBinderTab_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchBinderTab" ADD CONSTRAINT "ResearchBinderTab_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchIdeaClip" ADD CONSTRAINT "ResearchIdeaClip_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchIdeaClip" ADD CONSTRAINT "ResearchIdeaClip_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchIdeaClip" ADD CONSTRAINT "ResearchIdeaClip_binderTabId_fkey" FOREIGN KEY ("binderTabId") REFERENCES "ResearchBinderTab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryBinderTab" ADD CONSTRAINT "ExternalStoryBinderTab_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryBinderTab" ADD CONSTRAINT "ExternalStoryBinderTab_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryClip" ADD CONSTRAINT "ExternalStoryClip_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryClip" ADD CONSTRAINT "ExternalStoryClip_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryClip" ADD CONSTRAINT "ExternalStoryClip_binderTabId_fkey" FOREIGN KEY ("binderTabId") REFERENCES "ExternalStoryBinderTab"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStorySource" ADD CONSTRAINT "ExternalStorySource_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStorySource" ADD CONSTRAINT "ExternalStorySource_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStorySource" ADD CONSTRAINT "ExternalStorySource_storyArtifactVersionId_fkey" FOREIGN KEY ("storyArtifactVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryItem" ADD CONSTRAINT "ExternalStoryItem_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryItem" ADD CONSTRAINT "ExternalStoryItem_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryItem" ADD CONSTRAINT "ExternalStoryItem_storyArtifactVersionId_fkey" FOREIGN KEY ("storyArtifactVersionId") REFERENCES "ArtifactVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryItem" ADD CONSTRAINT "ExternalStoryItem_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "ExternalStorySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryVerification" ADD CONSTRAINT "ExternalStoryVerification_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryVerification" ADD CONSTRAINT "ExternalStoryVerification_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "BookStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryVerification" ADD CONSTRAINT "ExternalStoryVerification_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "ExternalStorySource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalStoryVerification" ADD CONSTRAINT "ExternalStoryVerification_externalStoryId_fkey" FOREIGN KEY ("externalStoryId") REFERENCES "ExternalStoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorProfile" ADD CONSTRAINT "AuthorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
