import { NextResponse } from "next/server"
import { authenticateMcpRequest } from "@/lib/mcp-request"
import { traceRepositoryFeatureFlow, type RetrievalTraceMode } from "@/lib/repository-retrieval"

type RetrievalFilters = {
  language?: string
  fileCategory?: string
  pathPrefix?: string
}

export async function POST(req: Request) {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { query?: string; mode?: RetrievalTraceMode } & RetrievalFilters
  try {
    body = (await req.json()) as { query?: string; mode?: RetrievalTraceMode } & RetrievalFilters
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const query = body.query?.trim()
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 })
  }

  const trace = await traceRepositoryFeatureFlow(
    apiKey.repository.id,
    query,
    {
      language: body.language,
      fileCategory: body.fileCategory,
      pathPrefix: body.pathPrefix,
    },
    body.mode ?? "auto"
  )

  if (!trace.ok) {
    return NextResponse.json({ error: trace.error }, { status: trace.status })
  }

  return NextResponse.json({
    repository: apiKey.repository,
    query,
    ...trace.data,
  })
}
