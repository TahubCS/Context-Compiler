import { NextResponse } from "next/server"
import {
  authenticateMcpRequest,
  mcpUnauthorizedResponse,
  operationResponse,
  readJsonObject,
  requestedRepository,
} from "@/lib/mcp-request"
import { runTrace, withRepository } from "@/lib/mcp-operations"

export async function POST(req: Request) {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return mcpUnauthorizedResponse()
  }

  const body = await readJsonObject(req)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  return operationResponse(
    await withRepository(apiKey, requestedRepository(req, body.repository), (repository) => runTrace(repository, body))
  )
}
