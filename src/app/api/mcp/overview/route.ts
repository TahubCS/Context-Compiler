import {
  authenticateMcpRequest,
  mcpUnauthorizedResponse,
  operationResponse,
  requestedRepository,
} from "@/lib/mcp-request"
import { runRepositoryOverview, withRepository } from "@/lib/mcp-operations"

export async function GET(req: Request) {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return mcpUnauthorizedResponse()
  }

  const repository = new URL(req.url).searchParams.get("repository")
  return operationResponse(
    await withRepository(apiKey, "repository_overview", requestedRepository(req, repository), runRepositoryOverview)
  )
}
