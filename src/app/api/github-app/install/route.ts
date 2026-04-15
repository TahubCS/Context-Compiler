import { NextResponse } from "next/server"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { getGitHubAppInstallUrl } from "@/lib/github-app"
import { WorkspaceRole } from "@prisma/client"

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

  try {
    return NextResponse.redirect(getGitHubAppInstallUrl(workspaceId))
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "GitHub App install URL is not configured.",
      },
      { status: 503 }
    )
  }
}
