import type { User as SupabaseUser } from "@supabase/supabase-js"
import { Prisma } from "@prisma/client"
import { decryptGithubToken, encryptGithubToken } from "@/lib/crypto"
import { prisma } from "./client"
import { ensurePersonalWorkspaceForUser } from "./workspaces"
import { syncPendingInviteNotificationsForUser } from "./notifications"

const PLATFORM_ADMIN_EMAIL = "Khatrim23@students.ecu.edu"

export type UserSubscriptionTier =
  Prisma.UserGetPayload<{ select: { subscriptionTier: true } }>["subscriptionTier"]

export type GitHubConnectionStatus = "connected" | "needs_reconnect"
export type UserOnboardingState = {
  onboardingSeenAt: Date | null
  onboardingCompletedAt: Date | null
  onboardingSkippedAt: Date | null
  repoTourCompletedAt: Date | null
}

export async function upsertSupabaseUser(user: SupabaseUser): Promise<void> {
  if (!user.email) return

  await prisma.user.upsert({
    where: { id: user.id },
    update: {
      email: user.email,
      githubId: user.user_metadata.provider_id?.toString() ?? null,
      name: user.user_metadata.full_name ?? user.user_metadata.user_name ?? null,
      avatarUrl: user.user_metadata.avatar_url ?? null,
      isPlatformAdmin: user.email.toLowerCase() === PLATFORM_ADMIN_EMAIL.toLowerCase(),
    },
    create: {
      id: user.id,
      email: user.email,
      githubId: user.user_metadata.provider_id?.toString() ?? null,
      name: user.user_metadata.full_name ?? user.user_metadata.user_name ?? null,
      avatarUrl: user.user_metadata.avatar_url ?? null,
      isPlatformAdmin: user.email.toLowerCase() === PLATFORM_ADMIN_EMAIL.toLowerCase(),
    },
  })

  await ensurePersonalWorkspaceForUser(
    user.id,
    user.email,
    user.user_metadata.full_name ?? user.user_metadata.user_name ?? null
  )

  await syncPendingInviteNotificationsForUser(user.id, user.email)
}

export async function updateUserGithubToken(userId: string, token: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      githubTokenEncrypted: encryptGithubToken(token),
      githubTokenUpdatedAt: new Date(),
    },
  })
}

export async function clearUserGithubToken(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      githubTokenEncrypted: null,
      githubTokenUpdatedAt: null,
    },
  })
}

export async function getUserGithubToken(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      githubTokenEncrypted: true,
    },
  })

  if (!row?.githubTokenEncrypted) {
    return null
  }

  return decryptGithubToken(row.githubTokenEncrypted)
}

export async function getUserGitHubConnectionStatus(
  userId: string
): Promise<GitHubConnectionStatus> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      githubTokenEncrypted: true,
    },
  })

  return row?.githubTokenEncrypted ? "connected" : "needs_reconnect"
}

export async function updateUserProfile(userId: string, data: { name: string }): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data })
}

export async function getUserSubscriptionTier(
  userId: string
): Promise<UserSubscriptionTier | null> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  })

  return dbUser?.subscriptionTier ?? null
}

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true },
  })

  return dbUser?.isPlatformAdmin ?? false
}

export async function getUserOnboardingState(userId: string): Promise<UserOnboardingState> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      onboardingSeenAt: true,
      onboardingCompletedAt: true,
      onboardingSkippedAt: true,
      repoTourCompletedAt: true,
    },
  })

  return {
    onboardingSeenAt: row?.onboardingSeenAt ?? null,
    onboardingCompletedAt: row?.onboardingCompletedAt ?? null,
    onboardingSkippedAt: row?.onboardingSkippedAt ?? null,
    repoTourCompletedAt: row?.repoTourCompletedAt ?? null,
  }
}

export async function markUserOnboardingSeen(userId: string): Promise<UserOnboardingState> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingSeenAt: new Date(),
      onboardingSkippedAt: null,
    },
    select: {
      onboardingSeenAt: true,
      onboardingCompletedAt: true,
      onboardingSkippedAt: true,
      repoTourCompletedAt: true,
    },
  })

  return updated
}

export async function skipUserOnboarding(userId: string): Promise<UserOnboardingState> {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingSeenAt: { set: new Date() },
      onboardingSkippedAt: { set: new Date() },
    },
    select: {
      onboardingSeenAt: true,
      onboardingCompletedAt: true,
      onboardingSkippedAt: true,
      repoTourCompletedAt: true,
    },
  })

  return updated
}

export async function completeUserRepoTour(userId: string): Promise<UserOnboardingState> {
  const now = new Date()
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingSeenAt: { set: now },
      onboardingCompletedAt: { set: now },
      onboardingSkippedAt: null,
      repoTourCompletedAt: { set: now },
    },
    select: {
      onboardingSeenAt: true,
      onboardingCompletedAt: true,
      onboardingSkippedAt: true,
      repoTourCompletedAt: true,
    },
  })

  return updated
}
