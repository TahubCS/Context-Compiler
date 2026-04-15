-- V2: workspaces, invites, notifications, audit logs, and workspace ownership.
-- Run this in Supabase SQL Editor.
-- After applying it, restart the app and run `bunx prisma generate` locally.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE "WorkspaceType" AS ENUM ('PERSONAL', 'TEAM');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "WorkspaceInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('WORKSPACE_INVITE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "User"
SET "isPlatformAdmin" = TRUE
WHERE lower("email") = lower('Khatrim23@students.ecu.edu');

CREATE TABLE IF NOT EXISTS "Workspace" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "type" "WorkspaceType" NOT NULL,
  "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
  "stripeCustomerId" TEXT UNIQUE,
  "stripeSubscriptionId" TEXT UNIQUE,
  "seatLimit" INTEGER,
  "ownerUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Workspace_ownerUserId_fkey'
  ) THEN
    ALTER TABLE "Workspace"
      ADD CONSTRAINT "Workspace_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Workspace_ownerUserId_idx" ON "Workspace"("ownerUserId");
CREATE INDEX IF NOT EXISTS "Workspace_subscriptionTier_idx" ON "Workspace"("subscriptionTier");

CREATE TABLE IF NOT EXISTS "WorkspaceMember" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "WorkspaceRole" NOT NULL,
  "joinedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "WorkspaceMember_workspaceId_userId_key" UNIQUE ("workspaceId", "userId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceMember_workspaceId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceMember"
      ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceMember_userId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceMember"
      ADD CONSTRAINT "WorkspaceMember_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
CREATE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_role_idx" ON "WorkspaceMember"("workspaceId", "role");

CREATE TABLE IF NOT EXISTS "WorkspaceInvite" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL,
  "status" "WorkspaceInviteStatus" NOT NULL DEFAULT 'PENDING',
  "invitedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "respondedAt" TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceInvite_workspaceId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceInvite"
      ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkspaceInvite_invitedByUserId_fkey'
  ) THEN
    ALTER TABLE "WorkspaceInvite"
      ADD CONSTRAINT "WorkspaceInvite_invitedByUserId_fkey"
      FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "WorkspaceInvite_email_status_idx" ON "WorkspaceInvite"("email", "status");
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_workspaceId_status_idx" ON "WorkspaceInvite"("workspaceId", "status");

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "workspaceId" UUID,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "readAt" TIMESTAMPTZ,
  "workspaceInviteId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Notification_userId_fkey'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Notification_workspaceId_fkey'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Notification_workspaceInviteId_fkey'
  ) THEN
    ALTER TABLE "Notification"
      ADD CONSTRAINT "Notification_workspaceInviteId_fkey"
      FOREIGN KEY ("workspaceInviteId") REFERENCES "WorkspaceInvite"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Notification_userId_readAt_createdAt_idx"
  ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX IF NOT EXISTS "Notification_workspaceInviteId_idx"
  ON "Notification"("workspaceInviteId");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" UUID,
  "actorUserId" UUID,
  "eventType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_workspaceId_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_actorUserId_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

ALTER TABLE "Repository"
  ADD COLUMN IF NOT EXISTS "workspaceId" UUID;

ALTER TABLE "SavedCart"
  ADD COLUMN IF NOT EXISTS "workspaceId" UUID;

ALTER TABLE "AnswerSession"
  ADD COLUMN IF NOT EXISTS "workspaceId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Repository_workspaceId_fkey'
  ) THEN
    ALTER TABLE "Repository"
      ADD CONSTRAINT "Repository_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SavedCart_workspaceId_fkey'
  ) THEN
    ALTER TABLE "SavedCart"
      ADD CONSTRAINT "SavedCart_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AnswerSession_workspaceId_fkey'
  ) THEN
    ALTER TABLE "AnswerSession"
      ADD CONSTRAINT "AnswerSession_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
DECLARE
  user_record RECORD;
  personal_workspace_id UUID;
  workspace_name TEXT;
  workspace_slug TEXT;
BEGIN
  FOR user_record IN
    SELECT "id", "email", "name"
    FROM "User"
  LOOP
    SELECT wm."workspaceId"
    INTO personal_workspace_id
    FROM "WorkspaceMember" wm
    JOIN "Workspace" w ON w."id" = wm."workspaceId"
    WHERE wm."userId" = user_record."id"
      AND w."type" = 'PERSONAL'
    LIMIT 1;

    IF personal_workspace_id IS NULL THEN
      workspace_name := COALESCE(
        NULLIF(split_part(COALESCE(user_record."name", ''), ' ', 1), '') || '''s Workspace',
        split_part(user_record."email", '@', 1)
      );
      workspace_slug := 'personal-' || replace(user_record."id"::TEXT, '-', '');

      INSERT INTO "Workspace" (
        "id",
        "name",
        "slug",
        "type",
        "subscriptionTier",
        "ownerUserId",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        gen_random_uuid(),
        workspace_name,
        workspace_slug,
        'PERSONAL',
        'FREE',
        user_record."id",
        NOW(),
        NOW()
      )
      RETURNING "id" INTO personal_workspace_id;

      INSERT INTO "WorkspaceMember" (
        "id",
        "workspaceId",
        "userId",
        "role",
        "joinedAt"
      )
      VALUES (
        gen_random_uuid(),
        personal_workspace_id,
        user_record."id",
        'OWNER',
        NOW()
      )
      ON CONFLICT ("workspaceId", "userId") DO NOTHING;
    END IF;

    UPDATE "Repository"
    SET "workspaceId" = personal_workspace_id
    WHERE "userId" = user_record."id"
      AND "workspaceId" IS NULL;

    UPDATE "SavedCart"
    SET "workspaceId" = personal_workspace_id
    WHERE "userId" = user_record."id"
      AND "workspaceId" IS NULL;

    UPDATE "AnswerSession"
    SET "workspaceId" = personal_workspace_id
    WHERE "userId" = user_record."id"
      AND "workspaceId" IS NULL;
  END LOOP;
END $$;

ALTER TABLE "Repository" DROP CONSTRAINT IF EXISTS "Repository_userId_githubUrl_key";
ALTER TABLE "Repository" DROP CONSTRAINT IF EXISTS "Repository_userId_githubRepoId_key";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Repository_workspaceId_githubUrl_key'
  ) THEN
    ALTER TABLE "Repository"
      ADD CONSTRAINT "Repository_workspaceId_githubUrl_key"
      UNIQUE ("workspaceId", "githubUrl");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Repository_workspaceId_githubRepoId_key'
  ) THEN
    ALTER TABLE "Repository"
      ADD CONSTRAINT "Repository_workspaceId_githubRepoId_key"
      UNIQUE ("workspaceId", "githubRepoId");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Repository_workspaceId_idx" ON "Repository"("workspaceId");
CREATE INDEX IF NOT EXISTS "Repository_workspaceId_scanStatus_idx" ON "Repository"("workspaceId", "scanStatus");
CREATE INDEX IF NOT EXISTS "Repository_workspaceId_githubRepoId_idx" ON "Repository"("workspaceId", "githubRepoId");
CREATE INDEX IF NOT EXISTS "SavedCart_workspaceId_repositoryId_updatedAt_idx" ON "SavedCart"("workspaceId", "repositoryId", "updatedAt");
CREATE INDEX IF NOT EXISTS "AnswerSession_workspaceId_repositoryId_updatedAt_idx" ON "AnswerSession"("workspaceId", "repositoryId", "updatedAt");

COMMIT;
