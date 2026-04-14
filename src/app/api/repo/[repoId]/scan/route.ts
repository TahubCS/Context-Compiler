import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import {
  createScanJob,
  failStaleScanJobForRepository,
  failQueuedScanJob,
  getRepositoryForScan,
  getUserGithubToken,
  isPrismaConnectivityError,
} from "@/lib/db"

type RouteParams = { params: Promise<{ repoId: string }> }

export async function POST(req: Request, { params }: RouteParams) {
  const { repoId } = await params

  const supabase = await createClient()
  const { data: userData } = await supabase.auth.getUser()

  const user = userData.user
  if (!user) {
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
  let githubToken: Awaited<ReturnType<typeof getUserGithubToken>>

  try {
    ;[repository, githubToken] = await Promise.all([
      getRepositoryForScan(repoId, user.id),
      getUserGithubToken(user.id),
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

  // provider_token only exists in the Supabase session immediately after OAuth
  // login — it's dropped after the first token refresh. We persist it to the
  // User table in the auth callback so it's always available here.
  if (!githubToken) {
    return NextResponse.json(
      { error: "GitHub token not found. Please sign out and sign in again." },
      { status: 400 }
    )
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
    if (error instanceof Error && error.message === "A scan is already queued or in progress for this repository.") {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }

  const backendUrl = process.env.AI_BACKEND_URL
  if (!backendUrl) {
    await failQueuedScanJob(scanJobId, repoId, "AI backend is not configured.").catch(() => {})
    return NextResponse.json({ error: "AI backend is not configured" }, { status: 503 })
  }

  const origin = new URL(req.url).origin

  // Fire-and-forget — do not await. Python service updates status via callback.
  fetch(`${backendUrl}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scan_job_id: scanJobId,
      repository_id: repository.id,
      github_url: repository.githubUrl,
      default_branch: repository.defaultBranch ?? "main",
      github_token: githubToken,
      callback_url: `${process.env.NEXT_PUBLIC_URL ?? origin}/api/repo/${repoId}/scan/status`,
      callback_secret: process.env.AI_CALLBACK_SECRET,
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(async () => {
    await failQueuedScanJob(
      scanJobId,
      repoId,
      "AI backend is not reachable. Make sure the Python service is running."
    ).catch(() => {})
  })

  return NextResponse.json({ status: "queued", scanJobId })
}
