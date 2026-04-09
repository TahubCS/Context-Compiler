import { RepositoryList } from "@/components/features/repositories/repository-list"
import { SyncRepositoriesButton } from "@/components/features/repositories/sync-repositories-button"
import { prisma } from "@/lib/prisma"
import { createClient } from "@/utils/supabase/server"

function isPrismaConnectivityError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()

  return (
    message.includes("tenant or user not found") ||
    message.includes("driveradaptererror") ||
    message.includes("can't reach database server") ||
    message.includes("connection")
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const displayName =
    user.user_metadata.full_name ?? user.user_metadata.user_name ?? user.email

  let repositories: {
    id: string
    name: string
    fullName: string
    githubUrl: string
    defaultBranch: string | null
    isPrivate: boolean
    scanStatus: string
    lastScannedAt: Date | null
  }[] = []
  let databaseError: string | null = null

  try {
    if (user.email) {
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

    repositories = await prisma.repository.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        fullName: true,
        githubUrl: true,
        defaultBranch: true,
        isPrivate: true,
        scanStatus: true,
        lastScannedAt: true,
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
    })
  } catch (dbError) {
    if (isPrismaConnectivityError(dbError)) {
      databaseError =
        "Database is currently unavailable. You can stay signed in, and repository data will appear once the database connection is fixed."
    } else {
      throw dbError
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-bold text-foreground">Welcome, {displayName}!</h1>
        <p className="mt-2 text-muted-foreground">
          Sync your repositories from GitHub to start scanning and indexing code.
        </p>
        <div className="mt-4 w-full md:w-fit">
          <SyncRepositoriesButton />
        </div>
        {databaseError ? (
          <p className="mt-3 text-sm text-destructive">{databaseError}</p>
        ) : null}
      </section>

      <RepositoryList repositories={repositories} databaseError={databaseError} />
    </div>
  )
}
