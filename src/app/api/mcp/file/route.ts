import { NextResponse } from "next/server"
import { authenticateMcpRequest } from "@/lib/mcp-request"
import { getRepositoryFileContext } from "@/lib/repository-retrieval"

export async function GET(req: Request) {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const filePath = url.searchParams.get("filePath")?.trim()
  if (!filePath) {
    return NextResponse.json({ error: "filePath is required" }, { status: 400 })
  }

  const startChunkIndexParam = url.searchParams.get("startChunkIndex")
  const maxChunksParam = url.searchParams.get("maxChunks")
  const startChunkIndex = startChunkIndexParam ? Number.parseInt(startChunkIndexParam, 10) : null
  const maxChunks = maxChunksParam ? Number.parseInt(maxChunksParam, 10) : null

  const fileContext = await getRepositoryFileContext(apiKey.repository.id, filePath, {
    startChunkIndex,
    maxChunks,
  })

  if (!fileContext) {
    return NextResponse.json({ error: "Indexed file context not found" }, { status: 404 })
  }

  return NextResponse.json({
    repository: apiKey.repository,
    file: fileContext,
  })
}
