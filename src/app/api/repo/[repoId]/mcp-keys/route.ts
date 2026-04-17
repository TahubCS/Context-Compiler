import { NextResponse } from "next/server"
import {
  createMcpApiKeyForRepository,
  getRepository,
  isPrismaConnectivityError,
  isPrismaMissingTableError,
  listMcpApiKeysForRepository,
} from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = { params: Promise<{ repoId: string }> }

function getMcpRouteErrorResponse(error: unknown) {
  if (
    error instanceof Error &&
    (error.message.includes("Missing MCP_API_KEY_SECRET") ||
      error.message.includes("MCP_API_KEY_SECRET must decode"))
  ) {
    return NextResponse.json(
      {
        error:
          "MCP key generation is not configured yet. Add MCP_API_KEY_SECRET to your server env first.",
      },
      { status: 503 }
    )
  }

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

  console.error("MCP key route failed", error)
  return NextResponse.json({ error: "Failed to load MCP key settings." }, { status: 500 })
}

export async function GET(_req: Request, { params }: RouteParams) {
  try {
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
  } catch (error) {
    return getMcpRouteErrorResponse(error)
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
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
  } catch (error) {
    return getMcpRouteErrorResponse(error)
  }
}
