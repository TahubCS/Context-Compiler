import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { hasUserRepositories, isPrismaConnectivityError } from "@/lib/db"
import { AppSidebar } from "@/components/features/app-sidebar"
import { AppTopNav } from "@/components/features/app-top-nav"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/")
  }

  const displayName =
    user.user_metadata.full_name ??
    user.user_metadata.user_name ??
    user.email ??
    "User"

  const avatarUrl: string | null = user.user_metadata.avatar_url ?? null

  let hasRepos = false
  try {
    hasRepos = await hasUserRepositories(user.id)
  } catch (err) {
    if (!isPrismaConnectivityError(err)) throw err
    // DB offline — treat as no repos; sidebar will show disabled Repos item
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar hasRepos={hasRepos} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppTopNav displayName={displayName} avatarUrl={avatarUrl} />
        <main className="flex-1 overflow-y-auto bg-muted/50 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
