import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { prisma, updateRepositoryScanStatus, isPrismaConnectivityError } from "@/lib/db"

type RouteParams = { params: Promise<{ repoId: string }> }

export async function POST(_req: Request, { params }: RouteParams) {
  const { repoId } = await params

  const supabase = await createClient()
  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ])

  const user = userData.user
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repository = await prisma.repository.findFirst({
    where: { id: repoId, userId: user.id },
    select: { id: true, githubUrl: true, defaultBranch: true },
  })

  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  const providerToken = sessionData.session?.provider_token
  if (!providerToken) {
    return NextResponse.json(
      { error: "Missing GitHub token. Please sign out and sign in again." },
      { status: 400 }
    )
  }

  try {
    await updateRepositoryScanStatus(repoId, {
      scanStatus: "QUEUED",
      scanProgress: 0,
      filesDiscovered: 0,
      filesProcessed: 0,
      errorMessage: null,
    })
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }

  const backendUrl = process.env.AI_BACKEND_URL
  if (!backendUrl) {
    return NextResponse.json({ error: "AI backend is not configured" }, { status: 503 })
  }

  // Fire-and-forget — do not await. Python service updates status via callback.
  fetch(`${backendUrl}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      repository_id: repository.id,
      github_url: repository.githubUrl,
      default_branch: repository.defaultBranch ?? "main",
      github_token: providerToken,
      callback_url: `${process.env.NEXT_PUBLIC_URL}/api/repo/${repoId}/scan/status`,
      callback_secret: process.env.AI_CALLBACK_SECRET,
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    // Best-effort — if the backend is unreachable, status stays QUEUED until backend comes up.
  })

  return NextResponse.json({ status: "queued" })
}
