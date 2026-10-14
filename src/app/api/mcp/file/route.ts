import { authenticateMcpRequest, mcpUnauthorizedResponse, operationResponse } from "@/lib/mcp-request"
import { runFileContext } from "@/lib/mcp-operations"

function integerParam(value: string | null): number | null {
  if (value === null) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

export async function GET(req: Request) {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return mcpUnauthorizedResponse()
  }

  const url = new URL(req.url)
  return operationResponse(
    await runFileContext(apiKey.repository, {
      filePath: url.searchParams.get("filePath") ?? undefined,
      startChunkIndex: integerParam(url.searchParams.get("startChunkIndex")),
      maxChunks: integerParam(url.searchParams.get("maxChunks")),
    })
  )
}
