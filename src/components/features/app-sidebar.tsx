"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bell, Code2, GitBranch, LayoutDashboard, Settings, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, requiresRepos: false },
  { href: "/repo", label: "Repos", icon: GitBranch, requiresRepos: true },
  { href: "/notifications", label: "Notifications", icon: Bell, requiresRepos: false },
  { href: "/settings", label: "Settings", icon: Settings, requiresRepos: false },
]

type AppSidebarProps = {
  hasRepos: boolean
  isPlatformAdmin?: boolean
}

export function AppSidebar({ hasRepos, isPlatformAdmin = false }: AppSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="sticky top-0 flex h-screen w-16 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:w-56">
      <div className="flex h-14 shrink-0 items-center border-b border-sidebar-border px-3 md:px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Code2 className="size-5 shrink-0 text-primary" />
          <span className="hidden truncate text-sm font-semibold text-foreground md:block">
            Context Compiler
          </span>
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV.map(({ href, label, icon: Icon, requiresRepos }) => {
          const isActive =
            href === "/dashboard" ? pathname === href : pathname.startsWith(href)
          const isDisabled = requiresRepos && !hasRepos

          const itemClass = cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            isDisabled
              ? "cursor-not-allowed text-sidebar-foreground/30"
              : isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )

          if (isDisabled) {
            return (
              <Tooltip key={href}>
                <TooltipTrigger asChild>
                  <span className={itemClass} aria-disabled="true">
                    <Icon className="size-4 shrink-0" />
                    <span className="hidden md:block">{label}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">
                  Connect the GitHub App and let repository sync finish first
                </TooltipContent>
              </Tooltip>
            )
          }

          return (
            <Link key={href} href={href} className={itemClass}>
              <Icon className="size-4 shrink-0" />
              <span className="hidden md:block">{label}</span>
            </Link>
          )
        })}
        {isPlatformAdmin ? (
          <Link
            href="/admin"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith("/admin")
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Shield className="size-4 shrink-0" />
            <span className="hidden md:block">Admin</span>
          </Link>
        ) : null}
      </nav>
    </aside>
  )
}
