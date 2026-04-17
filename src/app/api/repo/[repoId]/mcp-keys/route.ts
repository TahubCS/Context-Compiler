import { NextResponse } from "next/server"
import {
  createMcpApiKeyForRepository,
  getRepository,
  listMcpApiKeysForRepository,
} from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = { params: Promise<{ repoId: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { repoId } = await params
  const { user, workspace } = await getAuthenticatedAppContext()
  if (!user || !workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repository = await getRepository(repoId, workspace.id)
  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  const keys = await listMcpApiKeysForRepository(repoId, workspace.id, user.id)
  return NextResponse.json({ keys })
}

export async function POST(req: Request, { params }: RouteParams) {
  const { repoId } = await params
  const { user, workspace } = await getAuthenticatedAppContext()
  if (!user || !workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repository = await getRepository(repoId, workspace.id)
  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  let body: { name?: string }
  try {
    body = (await req.json()) as { name?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const name = body.name?.trim() || "Local agent key"
  const created = await createMcpApiKeyForRepository(repoId, workspace.id, user.id, name)

  return NextResponse.json({
    key: created.apiKey,
    plaintextKey: created.plaintextKey,
  })
}
