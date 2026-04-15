import { NextResponse } from "next/server"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { syncWorkspaceGithubInstallation } from "@/lib/github-repo-sync"
import { setActiveWorkspaceForUser } from "@/lib/db"
import {
  clearPendingGitHubAppWorkspaceCookie,
  getPendingGitHubAppWorkspaceCookie,
} from "@/lib/workspace-session"

export async function GET(req: Request) {
  const { user } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.redirect(new URL("/?error=github_app_auth_required", req.url))
  }

  const requestUrl = new URL(req.url)
  const installationId = requestUrl.searchParams.get("installation_id")?.trim()
  const workspaceId =
    requestUrl.searchParams.get("state")?.trim() ??
    (await getPendingGitHubAppWorkspaceCookie())

  if (!installationId || !workspaceId) {
    await clearPendingGitHubAppWorkspaceCookie()
    return NextResponse.redirect(new URL("/settings?github_app=missing_callback_params", req.url))
  }

  try {
    const allowed = await setActiveWorkspaceForUser(user.id, workspaceId)
    if (!allowed) {
      await clearPendingGitHubAppWorkspaceCookie()
      return NextResponse.redirect(new URL("/settings?github_app=workspace_not_found", req.url))
    }

    await syncWorkspaceGithubInstallation(user.id, workspaceId, installationId)
    await clearPendingGitHubAppWorkspaceCookie()
    return NextResponse.redirect(new URL("/settings?github_app=connected", req.url))
  } catch {
    await clearPendingGitHubAppWorkspaceCookie()
    return NextResponse.redirect(new URL("/settings?github_app=connection_failed", req.url))
  }
}
