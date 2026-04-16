import { redirect } from "next/navigation"
import { hasWorkspaceRepositories, isPrismaConnectivityError, listUserWorkspaces } from "@/lib/db"
import { AppSidebar } from "@/components/features/app-sidebar"
import { AppTopNav } from "@/components/features/app-top-nav"
import { getAuthenticatedAppContext } from "@/lib/app-context"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, workspace, isPlatformAdmin } = await getAuthenticatedAppContext()

  if (!user || !workspace) {
    redirect("/")
  }

  const displayName =
    user.user_metadata.full_name ?? user.user_metadata.user_name ?? user.email ?? "User"
  const avatarUrl: string | null = user.user_metadata.avatar_url ?? null

  let hasRepos = false
  try {
    hasRepos = await hasWorkspaceRepositories(workspace.id)
  } catch (err) {
    if (!isPrismaConnectivityError(err)) throw err
  }

  const workspaces = await listUserWorkspaces(user.id)

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar hasRepos={hasRepos} isPlatformAdmin={isPlatformAdmin} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopNav
          displayName={displayName}
          avatarUrl={avatarUrl}
          activeWorkspaceId={workspace.id}
          workspaces={workspaces.map((membership) => ({
            id: membership.workspace.id,
            name: membership.workspace.name,
            type: membership.workspace.type,
            subscriptionTier: membership.workspace.subscriptionTier,
            role: membership.role,
            accessMode: membership.accessMode,
          }))}
        />
        <main className="flex-1 overflow-y-auto bg-muted/50 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
