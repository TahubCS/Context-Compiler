-- V1.1.5: scan heartbeat and stale scan recovery support
-- Run this in Supabase SQL Editor if 0002 has already been applied.

ALTER TABLE "ScanJob" ADD COLUMN IF NOT EXISTS "lastHeartbeatAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ScanJob_repositoryId_lastHeartbeatAt_idx"
  ON "ScanJob"("repositoryId", "lastHeartbeatAt");
