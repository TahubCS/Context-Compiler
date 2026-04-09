import { createClient } from "@/utils/supabase/client"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If no user is found, send them back to the login page
  if (!user) {
    redirect("/")
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Welcome, {user.user_metadata.full_name}!</h1>
      <p className="text-muted-foreground">You are now authenticated via GitHub.</p>
    </div>
  )
}