import { NextResponse } from "next/server"
import { authenticateMcpRequest } from "@/lib/mcp-request"
import { searchRepositoryContext } from "@/lib/repository-retrieval"

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

  let body: { query?: string; limit?: number } & RetrievalFilters
  try {
    body = (await req.json()) as { query?: string; limit?: number } & RetrievalFilters
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const query = body.query?.trim()
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 })
  }

  const search = await searchRepositoryContext(
    apiKey.repository.id,
    query,
    {
      language: body.language,
      fileCategory: body.fileCategory,
      pathPrefix: body.pathPrefix,
    },
    typeof body.limit === "number" ? body.limit : 10
  )

  if (!search.ok) {
    return NextResponse.json({ error: search.error }, { status: search.status })
  }

  return NextResponse.json({
    repository: apiKey.repository,
    results: search.data,
  })
}
