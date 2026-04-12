import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { updateUserProfile, isPrismaConnectivityError } from "@/lib/db"

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { name?: string }
  try {
    body = (await req.json()) as { name?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 })
  if (name.length > 100) return NextResponse.json({ error: "name too long" }, { status: 400 })

  try {
    await updateUserProfile(user.id, { name })
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }
}
