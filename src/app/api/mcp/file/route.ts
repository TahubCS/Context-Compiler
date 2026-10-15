import {
  authenticateMcpRequest,
  mcpUnauthorizedResponse,
  operationResponse,
  requestedRepository,
} from "@/lib/mcp-request"
import { runFileContext, withRepository } from "@/lib/mcp-operations"

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
    await withRepository(apiKey, "get_file_context", requestedRepository(req, url.searchParams.get("repository")), (repository) =>
      runFileContext(repository, {
        filePath: url.searchParams.get("filePath") ?? undefined,
        startChunkIndex: integerParam(url.searchParams.get("startChunkIndex")),
        maxChunks: integerParam(url.searchParams.get("maxChunks")),
      })
    )
  )
}
