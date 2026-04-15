import { NextResponse } from "next/server"
import { getWorkspaceGitHubConnection, isPrismaConnectivityError } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { reconcileWorkspaceRepositoriesFromInstallation } from "@/lib/github-repo-sync"

export async function POST() {
  const { user, workspace } = await getAuthenticatedAppContext()
  if (!user || !workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const githubConnection = await getWorkspaceGitHubConnection(workspace.id)
    if (!githubConnection?.githubInstallationId) {
      return NextResponse.json(
        { error: "Connect the GitHub App for this workspace first." },
        { status: 400 }
      )
    }

    const syncedCount = await reconcileWorkspaceRepositoriesFromInstallation(
      user.id,
      workspace.id,
      githubConnection.githubInstallationId
    )

    return NextResponse.json({ syncedCount, source: "github-app" })
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reconcile repositories." },
      { status: 500 }
    )
  }
}
