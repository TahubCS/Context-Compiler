import { WorkspaceRole } from "@prisma/client"
import { AutoReconcileRepositories } from "@/components/features/repositories/auto-reconcile-repositories"
import { DashboardOnboardingDialog } from "@/components/features/dashboard/dashboard-onboarding-dialog"
import { RepositoryList } from "@/components/features/repositories/repository-list"
import { SyncRepositoriesButton } from "@/components/features/repositories/sync-repositories-button"
import {
  getUserOnboardingState,
  getWorkspaceGitHubConnection,
  getWorkspaceRepositories,
  isPrismaConnectivityError,
} from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

export default async function DashboardPage() {
  const { user, workspace, isPlatformAdmin } = await getAuthenticatedAppContext()
  if (!user || !workspace) return null

  const displayName =
    user.user_metadata.full_name ?? user.user_metadata.user_name ?? user.email

  let repositories: Awaited<ReturnType<typeof getWorkspaceRepositories>> = []
  let databaseError: string | null = null
  let githubConnection: Awaited<ReturnType<typeof getWorkspaceGitHubConnection>> | null = null
  let onboardingState = null as Awaited<ReturnType<typeof getUserOnboardingState>> | null

  try {
    ;[repositories, githubConnection, onboardingState] = await Promise.all([
      getWorkspaceRepositories(workspace.id),
      getWorkspaceGitHubConnection(workspace.id),
      getUserOnboardingState(user.id),
    ])
  } catch (dbError) {
    if (isPrismaConnectivityError(dbError)) {
      databaseError =
        "Database is currently unavailable. You can stay signed in, and repository data will appear once the database connection is fixed."
    } else {
      throw dbError
    }
  }

  const hasGitHubApp = !!githubConnection?.githubInstallationId
  const canManageGitHubApp =
    isPlatformAdmin ||
    workspace.currentUserRole === WorkspaceRole.OWNER ||
    workspace.currentUserRole === WorkspaceRole.ADMIN
  const shouldAutoOpenOnboarding = Boolean(
    onboardingState &&
      !onboardingState.onboardingCompletedAt &&
      !onboardingState.onboardingSkippedAt
  )
  const firstRepositoryId = repositories[0]?.id ?? null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <DashboardOnboardingDialog
        shouldAutoOpen={shouldAutoOpenOnboarding}
        hasGitHubApp={hasGitHubApp}
        firstRepositoryId={firstRepositoryId}
        workspaceId={workspace.id}
        canManageGitHubApp={canManageGitHubApp}
      />
      <AutoReconcileRepositories
        enabled={hasGitHubApp}
        lastRepoSyncAt={githubConnection?.lastRepoSyncAt?.toISOString() ?? null}
      />
      <section className="rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-bold text-foreground">Welcome, {displayName}!</h1>
        <p className="mt-2 text-muted-foreground">
          You are currently working in <span className="font-medium text-foreground">{workspace.name}</span>.{" "}
          {hasGitHubApp
            ? "This workspace is connected to GitHub App sync."
            : "Connect the GitHub App to keep repositories in sync automatically."}
        </p>
        {hasGitHubApp ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {githubConnection?.githubInstallationAccountLogin
                ? `Installed on ${githubConnection.githubInstallationAccountLogin}.`
                : "GitHub App installation connected."}
              {githubConnection?.lastRepoSyncAt
                ? ` Last synced ${githubConnection.lastRepoSyncAt.toLocaleString()}.`
                : " Repo reconciliation will run automatically."}
            </p>
            <div className="w-full md:w-fit">
              <SyncRepositoriesButton label="Sync now" />
            </div>
          </div>
        ) : (
          <div className="mt-4 w-full md:w-fit">
            <SyncRepositoriesButton />
          </div>
        )}
        {databaseError ? (
          <p className="mt-3 text-sm text-destructive">{databaseError}</p>
        ) : null}
      </section>

      <RepositoryList repositories={repositories} databaseError={databaseError} />
    </div>
  )
}
