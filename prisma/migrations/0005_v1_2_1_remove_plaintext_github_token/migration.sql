-- V1.2.1: remove legacy plaintext GitHub token storage
-- Run this in Supabase SQL Editor after V1.2 has been deployed and encrypted
-- token storage is in use. Users without githubTokenEncrypted must reconnect GitHub.

ALTER TABLE "User" DROP COLUMN IF EXISTS "githubToken";
