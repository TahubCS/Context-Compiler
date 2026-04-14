-- V1.1: stable repository identity, scan jobs, commit tracking, stale chunk support
-- Safe to run in Supabase SQL Editor.

-- Step 1: ScanJobStatus enum
DO $$ BEGIN
  CREATE TYPE "ScanJobStatus" AS ENUM ('QUEUED', 'SCANNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: Repository fields
ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "githubRepoId" TEXT;
ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "owner" TEXT;
ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "lastIndexedCommitSha" TEXT;
ALTER TABLE "Repository" ADD COLUMN IF NOT EXISTS "activeScanJobId" UUID;

-- Step 3: CodeDocument fields
ALTER TABLE "CodeDocument" ADD COLUMN IF NOT EXISTS "lastSeenScanJobId" UUID;

-- Step 4: ScanJob table
CREATE TABLE IF NOT EXISTS "ScanJob" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "repositoryId" UUID NOT NULL,
    "triggeredByUserId" UUID NOT NULL,
    "status" "ScanJobStatus" NOT NULL DEFAULT 'QUEUED',
    "indexedCommitSha" TEXT,
    "filesDiscovered" INTEGER NOT NULL DEFAULT 0,
    "filesProcessed" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanJob_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ScanJob" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "ScanJob" ADD CONSTRAINT "ScanJob_repositoryId_fkey"
    FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Step 5: Indexes and constraints
CREATE UNIQUE INDEX IF NOT EXISTS "Repository_userId_githubRepoId_key"
  ON "Repository"("userId", "githubRepoId");

CREATE INDEX IF NOT EXISTS "Repository_userId_githubRepoId_idx"
  ON "Repository"("userId", "githubRepoId");

CREATE INDEX IF NOT EXISTS "CodeDocument_repositoryId_lastSeenScanJobId_idx"
  ON "CodeDocument"("repositoryId", "lastSeenScanJobId");

CREATE INDEX IF NOT EXISTS "ScanJob_repositoryId_createdAt_idx"
  ON "ScanJob"("repositoryId", "createdAt");

CREATE INDEX IF NOT EXISTS "ScanJob_repositoryId_status_idx"
  ON "ScanJob"("repositoryId", "status");

CREATE INDEX IF NOT EXISTS "ScanJob_repositoryId_lastHeartbeatAt_idx"
  ON "ScanJob"("repositoryId", "lastHeartbeatAt");

CREATE INDEX IF NOT EXISTS "ScanJob_triggeredByUserId_idx"
  ON "ScanJob"("triggeredByUserId");

-- Step 6: Backfill obvious owner data from fullName when possible
UPDATE "Repository"
SET "owner" = split_part("fullName", '/', 1)
WHERE "owner" IS NULL
  AND position('/' in "fullName") > 0;

-- Step 7: Leave githubRepoId NULL for existing rows until next GitHub sync.
-- We cannot safely backfill immutable GitHub IDs from SQL alone.
