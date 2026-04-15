import { cookies } from "next/headers"

export const ACTIVE_WORKSPACE_COOKIE = "cc-active-workspace"
export const PENDING_GITHUB_APP_WORKSPACE_COOKIE = "cc-github-app-workspace"

export async function getActiveWorkspaceCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null
}

export async function setActiveWorkspaceCookie(workspaceId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
  })
}

export async function clearActiveWorkspaceCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(ACTIVE_WORKSPACE_COOKIE)
}

export async function getPendingGitHubAppWorkspaceCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(PENDING_GITHUB_APP_WORKSPACE_COOKIE)?.value ?? null
}

export async function setPendingGitHubAppWorkspaceCookie(workspaceId: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(PENDING_GITHUB_APP_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 15 * 60,
  })
}

export async function clearPendingGitHubAppWorkspaceCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(PENDING_GITHUB_APP_WORKSPACE_COOKIE)
}
