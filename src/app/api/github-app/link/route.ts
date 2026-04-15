import { NextResponse } from "next/server"
import { WorkspaceRole } from "@prisma/client"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { syncWorkspaceGithubInstallation } from "@/lib/github-repo-sync"
import { setActiveWorkspaceForUser } from "@/lib/db"

type LinkGitHubInstallationBody = {
  installationId?: string
  workspaceId?: string
}

export async function POST(req: Request) {
  const { user, workspace, isPlatformAdmin } = await getAuthenticatedAppContext()
  if (!user || !workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (
    !isPlatformAdmin &&
    workspace.currentUserRole !== WorkspaceRole.OWNER &&
    workspace.currentUserRole !== WorkspaceRole.ADMIN
  ) {
    return NextResponse.json(
      { error: "Only workspace owners or admins can link a GitHub App installation." },
      { status: 403 }
    )
  }

  const body = (await req.json()) as LinkGitHubInstallationBody
  const installationId = body.installationId?.trim()
  const workspaceId = body.workspaceId?.trim() || workspace.id

  if (!installationId || !/^\d+$/.test(installationId)) {
    return NextResponse.json(
      { error: "A valid numeric installation ID is required." },
      { status: 400 }
    )
  }

  try {
    const allowed = await setActiveWorkspaceForUser(user.id, workspaceId)
    if (!allowed) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 })
    }

    const syncedCount = await syncWorkspaceGithubInstallation(user.id, workspaceId, installationId)

    return NextResponse.json({
      ok: true,
      syncedCount,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not link the GitHub App installation.",
      },
      { status: 500 }
    )
  }
}
