import { NextResponse } from "next/server"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { syncWorkspaceGithubInstallation } from "@/lib/github-repo-sync"
import { setActiveWorkspaceForUser } from "@/lib/db"
import {
  clearPendingGitHubAppWorkspaceCookie,
  getPendingGitHubAppInstallation,
} from "@/lib/workspace-session"

export async function GET(req: Request) {
  const { user } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.redirect(new URL("/?error=github_app_auth_required", req.url))
  }

  const requestUrl = new URL(req.url)
  const installationId = requestUrl.searchParams.get("installation_id")?.trim()
  const returnedState = requestUrl.searchParams.get("state")?.trim()
  const pending = await getPendingGitHubAppInstallation()

  if (!installationId || !/^\d+$/.test(installationId) || !returnedState || !pending) {
    await clearPendingGitHubAppWorkspaceCookie()
    return NextResponse.redirect(new URL("/settings?github_app=missing_callback_params", req.url))
  }

  if (returnedState !== pending.state) {
    await clearPendingGitHubAppWorkspaceCookie()
    console.warn("Rejected GitHub App callback", { category: "invalid_installation_state" })
    return NextResponse.redirect(new URL("/settings?github_app=invalid_state", req.url))
  }

  const workspaceId = pending.workspaceId

  try {
    const allowed = await setActiveWorkspaceForUser(user.id, workspaceId)
    if (!allowed) {
      await clearPendingGitHubAppWorkspaceCookie()
      return NextResponse.redirect(new URL("/settings?github_app=workspace_not_found", req.url))
    }

    await syncWorkspaceGithubInstallation(user.id, workspaceId, installationId)
    await clearPendingGitHubAppWorkspaceCookie()
    return NextResponse.redirect(new URL("/settings?github_app=connected", req.url))
  } catch (error) {
    console.error("GitHub App callback failed", {
      category: "installation_sync",
      errorName: error instanceof Error ? error.name : "unknown",
    })
    await clearPendingGitHubAppWorkspaceCookie()
    return NextResponse.redirect(new URL("/settings?github_app=connection_failed", req.url))
  }
}
