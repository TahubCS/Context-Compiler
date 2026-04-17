import { NextResponse } from "next/server"
import { getRepository, revokeMcpApiKey } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = { params: Promise<{ repoId: string; keyId: string }> }

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { repoId, keyId } = await params
  const { user, workspace } = await getAuthenticatedAppContext()
  if (!user || !workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repository = await getRepository(repoId, workspace.id)
  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  const revoked = await revokeMcpApiKey(keyId, repoId, workspace.id, user.id)
  if (!revoked) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
