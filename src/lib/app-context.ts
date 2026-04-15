import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspaceForUser, isPlatformAdmin, upsertSupabaseUser } from "@/lib/db"

export async function getAuthenticatedAppContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !user.email) {
    return { user: null, workspace: null, isPlatformAdmin: false }
  }

  await upsertSupabaseUser(user)
  const [workspace, admin] = await Promise.all([
    getActiveWorkspaceForUser(user.id),
    isPlatformAdmin(user.id),
  ])

  return {
    user,
    workspace,
    isPlatformAdmin: admin,
  }
}
