-- V2.1: GitHub App integration, webhook delivery log, and repository reconciliation metadata.
-- Run this in Supabase SQL Editor.
-- After applying, restart the app and run `bunx prisma generate` locally.
-- Configure your GitHub App setup URL to point at:
--   <your-app-origin>/api/github-app/callback
-- Configure your GitHub App webhook URL to point at:
--   <your-app-origin>/api/github-app/webhook

BEGIN;

ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "githubInstallationId" TEXT,
  ADD COLUMN IF NOT EXISTS "githubInstallationAccountLogin" TEXT,
  ADD COLUMN IF NOT EXISTS "githubInstallationAccountType" TEXT,
  ADD COLUMN IF NOT EXISTS "githubAppConnectedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastRepoSyncAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastWebhookEventAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_githubInstallationId_key"
  ON "Workspace"("githubInstallationId")
  WHERE "githubInstallationId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "Workspace_lastRepoSyncAt_idx"
  ON "Workspace"("lastRepoSyncAt");

ALTER TABLE "Repository"
  ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "Repository_workspaceId_isArchived_idx"
  ON "Repository"("workspaceId", "isArchived");

CREATE TABLE IF NOT EXISTS "GitHubWebhookDelivery" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "deliveryId" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "installationId" TEXT,
  "workspaceId" UUID,
  "processed" BOOLEAN NOT NULL DEFAULT FALSE,
  "errorMessage" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3)
);

CREATE UNIQUE INDEX IF NOT EXISTS "GitHubWebhookDelivery_deliveryId_key"
  ON "GitHubWebhookDelivery"("deliveryId");

CREATE INDEX IF NOT EXISTS "GitHubWebhookDelivery_workspaceId_receivedAt_idx"
  ON "GitHubWebhookDelivery"("workspaceId", "receivedAt");

CREATE INDEX IF NOT EXISTS "GitHubWebhookDelivery_installationId_receivedAt_idx"
  ON "GitHubWebhookDelivery"("installationId", "receivedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GitHubWebhookDelivery_workspaceId_fkey'
  ) THEN
    ALTER TABLE "GitHubWebhookDelivery"
      ADD CONSTRAINT "GitHubWebhookDelivery_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
