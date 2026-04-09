import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/")
  }

  const displayName =
    user.user_metadata.full_name ?? user.user_metadata.user_name ?? user.email

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Welcome, {displayName}!</h1>
      <p className="text-muted-foreground">You are now authenticated via GitHub.</p>
    </div>
  )
}