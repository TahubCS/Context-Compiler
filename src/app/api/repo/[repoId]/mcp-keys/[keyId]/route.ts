import { NextResponse } from "next/server"
import {
  getRepository,
  isPrismaConnectivityError,
  isPrismaMissingTableError,
  revokeMcpApiKey,
} from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = { params: Promise<{ repoId: string; keyId: string }> }

export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
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
  } catch (error) {
    if (isPrismaMissingTableError(error, "McpApiKey")) {
      return NextResponse.json(
        {
          error:
            "MCP key storage is not ready yet. Apply the latest Prisma db push or the manual SQL migration for McpApiKey.",
        },
        { status: 503 }
      )
    }

    if (isPrismaConnectivityError(error)) {
      return NextResponse.json(
        { error: "Database connectivity is unavailable right now. Please try again shortly." },
        { status: 503 }
      )
    }

    console.error("MCP key revoke route failed", error)
    return NextResponse.json({ error: "Failed to revoke MCP key." }, { status: 500 })
  }
}
