import type { User as SupabaseUser } from "@supabase/supabase-js"
import { Prisma } from "@prisma/client"
import { prisma } from "./client"

export type UserSubscriptionTier =
  Prisma.UserGetPayload<{ select: { subscriptionTier: true } }>["subscriptionTier"]

/**
 * Upserts a Supabase-authenticated user into the Prisma User table.
 * Skips silently if user.email is null (no-op).
 */
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

/**
 * Persists the GitHub OAuth access token to the User row.
 * Called during the auth callback — the only moment Supabase guarantees
 * provider_token is present in the session.
 */
export async function updateUserGithubToken(
  userId: string,
  token: string
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { githubToken: token },
  })
}

/**
 * Retrieves the persisted GitHub OAuth token for a user.
 * Returns null if the user doesn't exist or hasn't linked GitHub.
 */
export async function getUserGithubToken(
  userId: string
): Promise<string | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubToken: true },
  })
  return row?.githubToken ?? null
}

export async function updateUserProfile(
  userId: string,
  data: { name: string }
): Promise<void> {
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
