import { NextResponse } from "next/server"
import {
  authenticateMcpRequest,
  mcpUnauthorizedResponse,
  operationResponse,
  readJsonObject,
  requestedRepository,
} from "@/lib/mcp-request"
import { runRequestRescan, withRepository } from "@/lib/mcp-operations"
import { getAppBaseUrl } from "@/lib/runtime-urls"

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
    await withRepository(apiKey, "request_rescan", requestedRepository(req, body.repository), (repository) =>
      runRequestRescan(apiKey, repository, getAppBaseUrl(req))
    )
  )
}
