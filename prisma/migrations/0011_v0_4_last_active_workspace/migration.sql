-- V0.4: durable last-used workspace restoration.
-- Run this in Supabase SQL Editor, then run `bunx prisma generate` locally.

BEGIN;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "lastActiveWorkspaceId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'User_lastActiveWorkspaceId_fkey'
  ) THEN
    ALTER TABLE "User"
      ADD CONSTRAINT "User_lastActiveWorkspaceId_fkey"
      FOREIGN KEY ("lastActiveWorkspaceId") REFERENCES "Workspace"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "User_lastActiveWorkspaceId_idx"
  ON "User"("lastActiveWorkspaceId");

COMMIT;
