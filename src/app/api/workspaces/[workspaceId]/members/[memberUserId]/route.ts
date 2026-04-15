import { NextResponse } from "next/server"
import { WorkspaceRole } from "@prisma/client"
import { removeWorkspaceMember, updateWorkspaceMemberRole } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = {
  params: Promise<{ workspaceId: string; memberUserId: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { workspaceId, memberUserId } = await params
  const { user, isPlatformAdmin } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { role?: WorkspaceRole }
  try {
    body = (await req.json()) as { role?: WorkspaceRole }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.role) {
    return NextResponse.json({ error: "role is required" }, { status: 400 })
  }

  try {
    const member = await updateWorkspaceMemberRole({
      workspaceId,
      actorUserId: user.id,
      memberUserId,
      role: body.role,
      isPlatformAdmin,
    })

    return NextResponse.json({ member })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update member role." },
      { status: 400 }
    )
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { workspaceId, memberUserId } = await params
  const { user, isPlatformAdmin } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await removeWorkspaceMember({
      workspaceId,
      actorUserId: user.id,
      memberUserId,
      isPlatformAdmin,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove member." },
      { status: 400 }
    )
  }
}
