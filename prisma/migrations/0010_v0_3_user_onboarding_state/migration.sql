-- V0.3 manual migration for Supabase SQL Editor
-- Adds user-specific onboarding persistence for dashboard welcome + repo walkthrough.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "onboardingSeenAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingSkippedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "repoTourCompletedAt" TIMESTAMP(3);
