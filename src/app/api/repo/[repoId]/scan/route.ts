import { NextResponse } from "next/server"
import {
  createScanJob,
  failQueuedScanJob,
  failStaleScanJobForRepository,
  getRepositoryForScan,
  isPrismaConnectivityError,
} from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { getAiBackendUrl, getAppBaseUrl } from "@/lib/runtime-urls"
import { resolveScanCredential } from "@/lib/scan-auth"

type RouteParams = { params: Promise<{ repoId: string }> }

export async function POST(req: Request, { params }: RouteParams) {
  const { repoId } = await params

  const { user, workspace } = await getAuthenticatedAppContext()
  if (!user || !workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await failStaleScanJobForRepository(repoId)
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }

  let repository: Awaited<ReturnType<typeof getRepositoryForScan>>
  let scanCredential: Awaited<ReturnType<typeof resolveScanCredential>>

  try {
    ;[repository, scanCredential] = await Promise.all([
      getRepositoryForScan(repoId, workspace.id),
      resolveScanCredential({
        workspaceGitHubInstallationId: workspace.githubInstallationId,
        userId: user.id,
      }),
    ])
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }

  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  if (!scanCredential.token) {
    return NextResponse.json({ error: scanCredential.error }, { status: 400 })
  }

  if (repository.activeScanJobId) {
    return NextResponse.json(
      { error: "A scan is already queued or in progress for this repository." },
      { status: 409 }
    )
  }

  let scanJobId: string
  try {
    const scanJob = await createScanJob(repoId, user.id)
    scanJobId = scanJob.id
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "A scan is already queued or in progress for this repository."
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }

  const backendUrl = getAiBackendUrl()
  if (!backendUrl) {
    await failQueuedScanJob(scanJobId, repoId, "AI backend is not configured.").catch(() => {})
    return NextResponse.json({ error: "AI backend is not configured" }, { status: 503 })
  }

  const appBaseUrl = getAppBaseUrl(req)

  let backendResponse: Response
  try {
    backendResponse = await fetch(`${backendUrl}/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scan_job_id: scanJobId,
        repository_id: repository.id,
        github_url: repository.githubUrl,
        default_branch: repository.defaultBranch ?? "main",
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
    return NextResponse.json(
      { error: "AI backend is not reachable. Make sure the Python service is running." },
      { status: 503 }
    )
  }

  if (!backendResponse.ok) {
    await failQueuedScanJob(
      scanJobId,
      repoId,
      `AI backend rejected the scan request with status ${backendResponse.status}.`
    ).catch(() => {})
    return NextResponse.json(
      { error: "AI backend rejected the scan request." },
      { status: 503 }
    )
  }

  return NextResponse.json({ status: "queued", scanJobId })
}
