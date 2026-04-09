import { RepositoryList } from "@/components/features/repositories/repository-list"
import { SyncRepositoriesButton } from "@/components/features/repositories/sync-repositories-button"
import { upsertSupabaseUser, getUserRepositories, isPrismaConnectivityError } from "@/lib/db"
import { createClient } from "@/utils/supabase/server"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const displayName =
    user.user_metadata.full_name ?? user.user_metadata.user_name ?? user.email

  let repositories: Awaited<ReturnType<typeof getUserRepositories>> = []
  let databaseError: string | null = null

  try {
    await upsertSupabaseUser(user)
    repositories = await getUserRepositories(user.id)
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
