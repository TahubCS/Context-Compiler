import { NextResponse } from "next/server"
import { authenticateMcpRequest } from "@/lib/mcp-request"

export async function GET(req: Request) {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.json({
    key: {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
    },
    workspace: apiKey.workspace,
    repository: apiKey.repository,
    user: apiKey.user,
  })
}
