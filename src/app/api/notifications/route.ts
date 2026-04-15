import { NextResponse } from "next/server"
import { listUserNotifications } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

export async function GET() {
  const { user } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const notifications = await listUserNotifications(user.id)
  return NextResponse.json({ notifications })
}
