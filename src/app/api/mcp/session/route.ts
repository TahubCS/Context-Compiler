import { NextResponse } from "next/server"
import { revokeOwnMcpApiKey } from "@/lib/db"
import { authenticateMcpRequest, mcpUnauthorizedResponse } from "@/lib/mcp-request"
import { describeSession } from "@/lib/mcp-operations"

export async function GET(req: Request) {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return mcpUnauthorizedResponse()
  }

  return NextResponse.json(await describeSession(apiKey))
}

/** Revokes the calling key (used by `context-compiler-mcp disconnect`). */
export async function DELETE(req: Request) {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return mcpUnauthorizedResponse()
  }

  await revokeOwnMcpApiKey(apiKey.id)
  return NextResponse.json({ ok: true })
}
