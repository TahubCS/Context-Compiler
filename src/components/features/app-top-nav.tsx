import { BreadcrumbNav } from "@/components/features/breadcrumb-nav"
import { UserAvatarDropdown } from "@/components/features/user-avatar-dropdown"

type AppTopNavProps = {
  displayName: string
  avatarUrl: string | null
}

export function AppTopNav({ displayName, avatarUrl }: AppTopNavProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-4 md:px-6">
      <BreadcrumbNav />
      <UserAvatarDropdown displayName={displayName} avatarUrl={avatarUrl} />
    </header>
  )
}
