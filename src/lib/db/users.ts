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

export async function getUserSubscriptionTier(
  userId: string
): Promise<UserSubscriptionTier | null> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  })

  return dbUser?.subscriptionTier ?? null
}
