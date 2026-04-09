import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getUserRepositories } from "@/lib/db"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repositories = await getUserRepositories(user.id)

  return NextResponse.json({ repositories })
}
