-- Add WORKBOOK to BookWorkflowType enum
ALTER TYPE "BookWorkflowType" ADD VALUE IF NOT EXISTS 'WORKBOOK';

-- Add parentBookId column to Book
ALTER TABLE "Book" ADD COLUMN IF NOT EXISTS "parentBookId" UUID;

-- Add foreign key constraint for self-relation
ALTER TABLE "Book" ADD CONSTRAINT "Book_parentBookId_fkey" FOREIGN KEY ("parentBookId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index on parentBookId
CREATE INDEX IF NOT EXISTS "Book_parentBookId_idx" ON "Book"("parentBookId");
