"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Code2, LayoutDashboard, GitBranch, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/repo", label: "Repos", icon: GitBranch },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function AppSidebar() {
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
        {NAV.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/dashboard" ? pathname === href : pathname.startsWith(href)

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="hidden md:block">{label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
