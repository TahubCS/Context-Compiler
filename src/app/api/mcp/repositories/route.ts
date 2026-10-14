import { authenticateMcpRequest, mcpUnauthorizedResponse, operationResponse } from "@/lib/mcp-request"
import { runListRepositories } from "@/lib/mcp-operations"

export async function GET(req: Request) {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return mcpUnauthorizedResponse()
  }

  return operationResponse(await runListRepositories(apiKey))
}
