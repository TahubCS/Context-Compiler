-- V1.3 manual migration for Supabase SQL Editor
-- Adds saved carts, answer sessions, and exportable citation snapshots.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'AnswerSessionStatus'
  ) THEN
    CREATE TYPE "AnswerSessionStatus" AS ENUM ('SAVED', 'ARCHIVED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SavedCart" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "repositoryId" UUID NOT NULL REFERENCES "Repository"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SavedCartItem" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "savedCartId" UUID NOT NULL REFERENCES "SavedCart"("id") ON DELETE CASCADE,
  "codeDocumentId" UUID REFERENCES "CodeDocument"("id") ON DELETE SET NULL,
  "filePath" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "language" TEXT,
  "contentSnapshot" TEXT NOT NULL,
  "score" DOUBLE PRECISION,
  "orderIndex" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AnswerSession" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "repositoryId" UUID NOT NULL REFERENCES "Repository"("id") ON DELETE CASCADE,
  "question" TEXT NOT NULL,
  "answer" TEXT NOT NULL,
  "status" "AnswerSessionStatus" NOT NULL DEFAULT 'SAVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AnswerCitation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "answerSessionId" UUID NOT NULL REFERENCES "AnswerSession"("id") ON DELETE CASCADE,
  "codeDocumentId" UUID REFERENCES "CodeDocument"("id") ON DELETE SET NULL,
  "filePath" TEXT NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "language" TEXT,
  "contentSnapshot" TEXT NOT NULL,
  "score" DOUBLE PRECISION,
  "orderIndex" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS "SavedCart_userId_repositoryId_updatedAt_idx"
  ON "SavedCart" ("userId", "repositoryId", "updatedAt");

CREATE INDEX IF NOT EXISTS "SavedCart_repositoryId_updatedAt_idx"
  ON "SavedCart" ("repositoryId", "updatedAt");

CREATE INDEX IF NOT EXISTS "SavedCartItem_savedCartId_orderIndex_idx"
  ON "SavedCartItem" ("savedCartId", "orderIndex");

CREATE INDEX IF NOT EXISTS "SavedCartItem_codeDocumentId_idx"
  ON "SavedCartItem" ("codeDocumentId");

CREATE INDEX IF NOT EXISTS "AnswerSession_userId_repositoryId_updatedAt_idx"
  ON "AnswerSession" ("userId", "repositoryId", "updatedAt");

CREATE INDEX IF NOT EXISTS "AnswerSession_repositoryId_updatedAt_idx"
  ON "AnswerSession" ("repositoryId", "updatedAt");

CREATE INDEX IF NOT EXISTS "AnswerCitation_answerSessionId_orderIndex_idx"
  ON "AnswerCitation" ("answerSessionId", "orderIndex");

CREATE INDEX IF NOT EXISTS "AnswerCitation_codeDocumentId_idx"
  ON "AnswerCitation" ("codeDocumentId");
