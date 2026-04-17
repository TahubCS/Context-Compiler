import {
  createScanJob,
  failQueuedScanJob,
  failStaleScanJobForRepository,
  getRepositoryForScan,
  isPrismaConnectivityError,
} from "@/lib/db"
import { resolveScanCredential } from "@/lib/scan-auth"
import { getGitHubDefaultBranchHeadSha } from "@/lib/github-repository-refs"
import { getAiBackendUrl } from "@/lib/runtime-urls"

export type ScanDispatchResult =
  | { status: "dispatched"; scanJobId: string }
  | { status: "up_to_date"; sha: string }
  | { status: "already_scanning" }
  | { status: "repo_not_found" }
  | { status: "credential_missing"; error: string }
  | { status: "backend_unavailable"; error: string }

export async function dispatchRepositoryScan(input: {
  repoId: string
  workspaceId: string
  workspaceGitHubInstallationId: string | null | undefined
  triggeredByUserId: string
  /** When provided (e.g. from a webhook push payload), skips the GitHub API call to fetch HEAD SHA. */
  knownHeadSha?: string
  appBaseUrl: string
}): Promise<ScanDispatchResult> {
  const {
    repoId,
    workspaceId,
    workspaceGitHubInstallationId,
    triggeredByUserId,
    knownHeadSha,
    appBaseUrl,
  } = input

  try {
    await failStaleScanJobForRepository(repoId)
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return { status: "backend_unavailable", error: "Database unavailable" }
    }
    throw error
  }

  let repository: Awaited<ReturnType<typeof getRepositoryForScan>>
  let scanCredential: Awaited<ReturnType<typeof resolveScanCredential>>

  try {
    ;[repository, scanCredential] = await Promise.all([
      getRepositoryForScan(repoId, workspaceId),
      resolveScanCredential({ workspaceGitHubInstallationId, userId: triggeredByUserId }),
    ])
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return { status: "backend_unavailable", error: "Database unavailable" }
    }
    throw error
  }

  if (!repository) {
    return { status: "repo_not_found" }
  }

  if (!scanCredential.token) {
    return { status: "credential_missing", error: scanCredential.error }
  }

  if (repository.activeScanJobId) {
    return { status: "already_scanning" }
  }

  const defaultBranch = repository.defaultBranch ?? "main"

  const resolvedSha = knownHeadSha
    ? knownHeadSha
    : await getGitHubDefaultBranchHeadSha({
        githubUrl: repository.githubUrl,
        defaultBranch,
        token: scanCredential.token,
      })

  if (resolvedSha && repository.lastIndexedCommitSha && resolvedSha === repository.lastIndexedCommitSha) {
    return { status: "up_to_date", sha: resolvedSha }
  }

  let scanJobId: string
  try {
    const scanJob = await createScanJob(repoId, triggeredByUserId)
    scanJobId = scanJob.id
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "A scan is already queued or in progress for this repository."
    ) {
      return { status: "already_scanning" }
    }
    if (isPrismaConnectivityError(error)) {
      return { status: "backend_unavailable", error: "Database unavailable" }
    }
    throw error
  }

  const backendUrl = getAiBackendUrl()
  if (!backendUrl) {
    await failQueuedScanJob(scanJobId, repoId, "AI backend is not configured.").catch(() => {})
    return { status: "backend_unavailable", error: "AI backend is not configured" }
  }

  let backendResponse: Response
  try {
    backendResponse = await fetch(`${backendUrl}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scan_job_id: scanJobId,
        repository_id: repository.id,
        github_url: repository.githubUrl,
        default_branch: defaultBranch,
        previous_indexed_commit_sha: repository.lastIndexedCommitSha,
        repository_index_format_version: repository.indexFormatVersion,
        github_token: scanCredential.token,
        callback_url: `${appBaseUrl}/api/repo/${repoId}/scan/status`,
        callback_secret: process.env.AI_CALLBACK_SECRET,
      }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    await failQueuedScanJob(
      scanJobId,
      repoId,
      "AI backend is not reachable. Make sure the Python service is running."
    ).catch(() => {})
    return {
      status: "backend_unavailable",
      error: "AI backend is not reachable. Make sure the Python service is running.",
    }
  }

  if (!backendResponse.ok) {
    await failQueuedScanJob(
      scanJobId,
      repoId,
      `AI backend rejected the scan request with status ${backendResponse.status}.`
    ).catch(() => {})
    return { status: "backend_unavailable", error: "AI backend rejected the scan request." }
  }

  return { status: "dispatched", scanJobId }
}
