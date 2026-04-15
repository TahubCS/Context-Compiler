import { getUserGithubToken } from "@/lib/db"
import { createGitHubInstallationAccessToken } from "@/lib/github-app"

export type ResolvedScanCredential =
  | {
      token: string
      source: "github-app" | "oauth"
      error?: never
    }
  | {
      token: null
      source: "github-app" | "oauth" | null
      error: string
    }

type ResolveScanCredentialInput = {
  workspaceGitHubInstallationId: string | null | undefined
  userId: string
}

export async function resolveScanCredential(
  input: ResolveScanCredentialInput
): Promise<ResolvedScanCredential> {
  if (input.workspaceGitHubInstallationId) {
    try {
      const token = await createGitHubInstallationAccessToken(input.workspaceGitHubInstallationId)
      return {
        token,
        source: "github-app",
      }
    } catch {
      return {
        token: null,
        source: "github-app",
        error:
          "This workspace is connected to GitHub App sync, but the installation token could not be created. Reconnect the workspace GitHub App in Settings before starting a scan.",
      }
    }
  }

  const githubToken = await getUserGithubToken(input.userId)
  if (githubToken) {
    return {
      token: githubToken,
      source: "oauth",
    }
  }

  return {
    token: null,
    source: null,
    error:
      "Connect the workspace GitHub App or reconnect your GitHub account before starting a scan.",
  }
}
