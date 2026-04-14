-- V1.2: encrypted GitHub token storage on User
-- Run this in Supabase SQL Editor.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "githubTokenEncrypted" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "githubTokenUpdatedAt" TIMESTAMP(3);

-- Legacy plaintext column is intentionally kept during rollout so the app can
-- lazily migrate existing tokens on first use. Do not backfill encryption in SQL.
