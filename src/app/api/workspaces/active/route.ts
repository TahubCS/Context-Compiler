import { NextResponse } from "next/server"
import { setActiveWorkspaceForUser } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

export async function POST(req: Request) {
  const { user } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { workspaceId?: string }
  try {
    body = (await req.json()) as { workspaceId?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const workspaceId = body.workspaceId?.trim()
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 })
  }

  const changed = await setActiveWorkspaceForUser(user.id, workspaceId)
  if (!changed) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
