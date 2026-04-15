import { NextResponse } from "next/server"
import { markNotificationRead } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = {
  params: Promise<{ notificationId: string }>
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { notificationId } = await params
  const { user } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const updated = await markNotificationRead(user.id, notificationId)
  if (!updated) {
    return NextResponse.json({ error: "Notification not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
