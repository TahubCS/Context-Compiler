import { NextResponse } from "next/server"
import { authenticateMcpRequest, mcpUnauthorizedResponse, operationResponse, readJsonObject } from "@/lib/mcp-request"
import { runContextPack } from "@/lib/mcp-operations"

export async function POST(req: Request) {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return mcpUnauthorizedResponse()
  }

  const body = await readJsonObject(req)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  return operationResponse(await runContextPack(apiKey.repository, body))
}
