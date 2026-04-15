import { NextResponse } from "next/server"
import { declineWorkspaceInvite } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = {
  params: Promise<{ inviteId: string }>
}

export async function POST(_req: Request, { params }: RouteParams) {
  const { inviteId } = await params
  const { user } = await getAuthenticatedAppContext()
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await declineWorkspaceInvite({
      inviteId,
      userId: user.id,
      email: user.email,
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not decline invite." },
      { status: 400 }
    )
  }
}
