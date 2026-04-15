import { deleteRepositoriesMissingFromGitHubIds, deleteRepositoryByGitHubRepoId, markWorkspaceRepoSyncSuccess, markWorkspaceWebhookReceived, setRepositoryArchivedState, updateWorkspaceGitHubInstallation, upsertGitHubRepositories } from "@/lib/db"
import {
  getGitHubAppInstallation,
  listInstallationRepositories,
  type GitHubWebhookPayload,
} from "@/lib/github-app"

function mapGitHubRepository(repo: {
  id: number
  name: string
  full_name: string
  html_url: string
  default_branch: string | null
  private: boolean
  archived?: boolean
  owner: {
    login: string
  }
}) {
  return {
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    html_url: repo.html_url,
    default_branch: repo.default_branch,
    private: repo.private,
    archived: repo.archived ?? false,
    owner: {
      login: repo.owner.login,
    },
  }
}

export async function syncWorkspaceGithubInstallation(
  userId: string,
  workspaceId: string,
  installationId: string
) {
  const installation = await getGitHubAppInstallation(installationId)

  await updateWorkspaceGitHubInstallation({
    workspaceId,
    installationId: String(installation.id),
    accountLogin: installation.account?.login ?? null,
    accountType: installation.account?.type ?? null,
  })

  return reconcileWorkspaceRepositoriesFromInstallation(userId, workspaceId, installationId)
}

export async function reconcileWorkspaceRepositoriesFromInstallation(
  userId: string,
  workspaceId: string,
  installationId: string
) {
  const repositories = await listInstallationRepositories(installationId)
  const mapped = repositories.map(mapGitHubRepository)

  await upsertGitHubRepositories(userId, workspaceId, mapped)
  await deleteRepositoriesMissingFromGitHubIds(
    workspaceId,
    mapped.map((repository) => String(repository.id))
  )
  await markWorkspaceRepoSyncSuccess(workspaceId)

  return mapped.length
}

export async function processGitHubWebhookForWorkspace(input: {
  userId: string
  workspaceId: string
  eventName: string
  payload: GitHubWebhookPayload
}) {
  await markWorkspaceWebhookReceived(input.workspaceId)

  switch (input.eventName) {
    case "installation":
      if (input.payload.action === "deleted") {
        return { changed: true }
      }

      if (input.payload.installation?.id) {
        const installation = await getGitHubAppInstallation(String(input.payload.installation.id))
        await updateWorkspaceGitHubInstallation({
          workspaceId: input.workspaceId,
          installationId: String(installation.id),
          accountLogin: installation.account?.login ?? null,
          accountType: installation.account?.type ?? null,
        })
        await reconcileWorkspaceRepositoriesFromInstallation(
          input.userId,
          input.workspaceId,
          String(installation.id)
        )
      }
      return { changed: true }

    case "installation_repositories": {
      if (input.payload.repositories_added?.length) {
        await upsertGitHubRepositories(
          input.userId,
          input.workspaceId,
          input.payload.repositories_added.map(mapGitHubRepository)
        )
      }

      if (input.payload.repositories_removed?.length) {
        for (const repo of input.payload.repositories_removed) {
          await deleteRepositoryByGitHubRepoId(input.workspaceId, String(repo.id))
        }
      }

      await markWorkspaceRepoSyncSuccess(input.workspaceId)
      return { changed: true }
    }

    case "repository": {
      const repository = input.payload.repository
      if (!repository) {
        return { changed: false }
      }

      if (input.payload.action === "deleted") {
        await deleteRepositoryByGitHubRepoId(input.workspaceId, String(repository.id))
        await markWorkspaceRepoSyncSuccess(input.workspaceId)
        return { changed: true }
      }

      if (input.payload.action === "archived") {
        await setRepositoryArchivedState(input.workspaceId, String(repository.id), true)
        await markWorkspaceRepoSyncSuccess(input.workspaceId)
        return { changed: true }
      }

      if (input.payload.action === "unarchived") {
        await setRepositoryArchivedState(input.workspaceId, String(repository.id), false)
        await markWorkspaceRepoSyncSuccess(input.workspaceId)
        return { changed: true }
      }

      await upsertGitHubRepositories(input.userId, input.workspaceId, [mapGitHubRepository(repository)])
      await markWorkspaceRepoSyncSuccess(input.workspaceId)
      return { changed: true }
    }

    default:
      return { changed: false }
  }
}
