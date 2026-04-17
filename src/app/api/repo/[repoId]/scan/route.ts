import { NextResponse } from "next/server"
import { isPrismaConnectivityError } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { getAppBaseUrl } from "@/lib/runtime-urls"
import { dispatchRepositoryScan } from "@/lib/scan-dispatch"

type RouteParams = { params: Promise<{ repoId: string }> }

export async function POST(req: Request, { params }: RouteParams) {
  const { repoId } = await params

  const { user, workspace } = await getAuthenticatedAppContext()
  if (!user || !workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await dispatchRepositoryScan({
      repoId,
      workspaceId: workspace.id,
      workspaceGitHubInstallationId: workspace.githubInstallationId,
      triggeredByUserId: user.id,
      appBaseUrl: getAppBaseUrl(req),
    })

    switch (result.status) {
      case "dispatched":
        return NextResponse.json({ status: "queued", scanJobId: result.scanJobId })
      case "up_to_date":
        return NextResponse.json({
          status: "up_to_date",
          latestCommitSha: result.sha,
          message:
            "Repository is already up to date. No new changes were detected on the default branch.",
        })
      case "already_scanning":
        return NextResponse.json(
          { error: "A scan is already queued or in progress for this repository." },
          { status: 409 }
        )
      case "repo_not_found":
        return NextResponse.json({ error: "Repository not found" }, { status: 404 })
      case "credential_missing":
        return NextResponse.json({ error: result.error }, { status: 400 })
      case "backend_unavailable":
        return NextResponse.json({ error: result.error }, { status: 503 })
    }
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }
}
