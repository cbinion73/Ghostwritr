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
CREATE INDEX "AuthorProfile_userId_idx" ON "AuthorProfile"("userId");

-- CreateIndex
CREATE INDEX "AuthorProfile_isDefault_idx" ON "AuthorProfile"("isDefault");

-- AddForeignKey
ALTER TABLE "AuthorProfile" ADD CONSTRAINT "AuthorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
