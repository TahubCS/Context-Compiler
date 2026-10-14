import { NextResponse } from "next/server"
import { authenticateMcpRequest, mcpUnauthorizedResponse } from "@/lib/mcp-request"
import { describeSession } from "@/lib/mcp-operations"

export async function GET(req: Request) {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return mcpUnauthorizedResponse()
  }

  return NextResponse.json(describeSession(apiKey))
}
