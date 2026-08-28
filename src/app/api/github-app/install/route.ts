import { NextResponse } from "next/server"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { getGitHubAppInstallUrl } from "@/lib/github-app"
import { setPendingGitHubAppInstallation } from "@/lib/workspace-session"
import { WorkspaceRole } from "@prisma/client"
import { randomBytes } from "node:crypto"

export async function GET(req: Request) {
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
      { error: "Only workspace owners or admins can connect the GitHub App." },
      { status: 403 }
    )
  }

  const requestUrl = new URL(req.url)
  const workspaceId = requestUrl.searchParams.get("workspaceId")?.trim() || workspace.id
  if (workspaceId !== workspace.id) {
    return NextResponse.json({ error: "The requested workspace is not active or accessible." }, { status: 403 })
  }

  try {
    const state = randomBytes(32).toString("base64url")
    await setPendingGitHubAppInstallation({ workspaceId, state })
    return NextResponse.redirect(getGitHubAppInstallUrl(state))
  } catch (error) {
    console.error("GitHub App installation could not start", {
      category: "github_app_install_configuration",
      errorName: error instanceof Error ? error.name : "unknown",
    })
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "GitHub App install URL is not configured.",
      },
      { status: 503 }
    )
  }
}
