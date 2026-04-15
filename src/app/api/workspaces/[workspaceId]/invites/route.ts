import { NextResponse } from "next/server"
import { WorkspaceRole } from "@prisma/client"
import {
  createWorkspaceInvite,
  getWorkspaceMemberRole,
  listWorkspaceInvites,
} from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = {
  params: Promise<{ workspaceId: string }>
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { workspaceId } = await params
  const { user, isPlatformAdmin } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const role = await getWorkspaceMemberRole(user.id, workspaceId)
  if (!role && !isPlatformAdmin) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
  }

  const invites = await listWorkspaceInvites(workspaceId)
  return NextResponse.json({ invites })
}

export async function POST(req: Request, { params }: RouteParams) {
  const { workspaceId } = await params
  const { user, isPlatformAdmin } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { email?: string; role?: WorkspaceRole }
  try {
    body = (await req.json()) as { email?: string; role?: WorkspaceRole }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = body.email?.trim()
  const role = body.role ?? WorkspaceRole.MEMBER

  if (!email) {
    return NextResponse.json({ error: "Invite email is required." }, { status: 400 })
  }

  try {
    const invite = await createWorkspaceInvite({
      workspaceId,
      invitedByUserId: user.id,
      email,
      role,
      isPlatformAdmin,
    })

    return NextResponse.json({ invite }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create invite." },
      { status: 400 }
    )
  }
}
