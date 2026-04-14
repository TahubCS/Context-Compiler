import type { User as SupabaseUser } from "@supabase/supabase-js"
import { Prisma } from "@prisma/client"
import { decryptGithubToken, encryptGithubToken } from "@/lib/crypto"
import { prisma } from "./client"

export type UserSubscriptionTier =
  Prisma.UserGetPayload<{ select: { subscriptionTier: true } }>["subscriptionTier"]

export async function upsertSupabaseUser(user: SupabaseUser): Promise<void> {
  if (!user.email) return

  await prisma.user.upsert({
    where: { id: user.id },
    update: {
      email: user.email,
      githubId: user.user_metadata.provider_id?.toString() ?? null,
      name: user.user_metadata.full_name ?? user.user_metadata.user_name ?? null,
      avatarUrl: user.user_metadata.avatar_url ?? null,
    },
    create: {
      id: user.id,
      email: user.email,
      githubId: user.user_metadata.provider_id?.toString() ?? null,
      name: user.user_metadata.full_name ?? user.user_metadata.user_name ?? null,
      avatarUrl: user.user_metadata.avatar_url ?? null,
    },
  })
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
      githubToken: null,
      githubTokenEncrypted: null,
      githubTokenUpdatedAt: null,
    },
  })
}

export async function getUserGithubToken(userId: string): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      githubToken: true,
      githubTokenEncrypted: true,
    },
  })

  if (!row) return null

  if (row.githubTokenEncrypted) {
    return decryptGithubToken(row.githubTokenEncrypted)
  }

  if (!row.githubToken) {
    return null
  }

  // Temporary plaintext fallback for existing rows. This lazily migrates
  // legacy tokens on first use without requiring SQL-side encryption.
  await updateUserGithubToken(userId, row.githubToken)
  return row.githubToken
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
