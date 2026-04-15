import { NextResponse } from "next/server"
import { SubscriptionTier, WorkspaceType } from "@prisma/client"
import { canCreatePaidWorkspace, createWorkspace } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

export async function POST(req: Request) {
  const { user, isPlatformAdmin } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: {
    name?: string
    type?: WorkspaceType
  }

  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const name = body.name?.trim()
  const type = body.type ?? WorkspaceType.TEAM

  if (!name) {
    return NextResponse.json({ error: "Workspace name is required." }, { status: 400 })
  }

  if (type !== WorkspaceType.TEAM) {
    return NextResponse.json(
      { error: "Only shared team workspaces can be created here." },
      { status: 400 }
    )
  }

  const allowed = await canCreatePaidWorkspace(user.id)
  if (!allowed && !isPlatformAdmin) {
    return NextResponse.json(
      { error: "Upgrade to a Team or Enterprise plan before creating a shared workspace." },
      { status: 403 }
    )
  }

  const workspace = await createWorkspace(user.id, {
    name,
    type,
    subscriptionTier: SubscriptionTier.FREE,
    seatLimit: null,
  })

  return NextResponse.json({ workspace }, { status: 201 })
}
