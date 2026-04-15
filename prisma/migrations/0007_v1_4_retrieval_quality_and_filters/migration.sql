-- V1.4 manual migration for Supabase SQL Editor
-- Adds retrieval index versioning plus core filter metadata on CodeDocument.
-- Existing repositories will remain usable, but should be re-scanned to populate
-- the new metadata and upgrade to index format version 2.

ALTER TABLE "Repository"
  ADD COLUMN IF NOT EXISTS "indexFormatVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "CodeDocument"
  ADD COLUMN IF NOT EXISTS "fileCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "chunkType" TEXT,
  ADD COLUMN IF NOT EXISTS "pathBucket" TEXT;

CREATE INDEX IF NOT EXISTS "CodeDocument_repositoryId_fileCategory_idx"
  ON "CodeDocument" ("repositoryId", "fileCategory");

CREATE INDEX IF NOT EXISTS "CodeDocument_repositoryId_pathBucket_idx"
  ON "CodeDocument" ("repositoryId", "pathBucket");
