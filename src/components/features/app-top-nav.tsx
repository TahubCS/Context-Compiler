import { WorkspaceSwitcher } from "@/components/features/workspaces/workspace-switcher"
import { BreadcrumbNav } from "@/components/features/breadcrumb-nav"
import { UserAvatarDropdown } from "@/components/features/user-avatar-dropdown"

type AppTopNavProps = {
  displayName: string
  avatarUrl: string | null
  activeWorkspaceId: string | null
  workspaces: Array<{
    id: string
    name: string
    type: "PERSONAL" | "TEAM"
    subscriptionTier: string
    role: string
  }>
}

export function AppTopNav({
  displayName,
  avatarUrl,
  activeWorkspaceId,
  workspaces,
}: AppTopNavProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 md:px-6">
      <BreadcrumbNav />
      <div className="flex items-center gap-3">
        <WorkspaceSwitcher activeWorkspaceId={activeWorkspaceId} workspaces={workspaces} />
        <UserAvatarDropdown displayName={displayName} avatarUrl={avatarUrl} />
      </div>
    </header>
  )
}
