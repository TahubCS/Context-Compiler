import { NextResponse } from "next/server"
import { authenticateMcpRequest } from "@/lib/mcp-request"
import { buildRepositoryContextPack } from "@/lib/repository-retrieval"

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

  let body: { task?: string; maxSnippets?: number } & RetrievalFilters
  try {
    body = (await req.json()) as { task?: string; maxSnippets?: number } & RetrievalFilters
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const task = body.task?.trim()
  if (!task) {
    return NextResponse.json({ error: "task is required" }, { status: 400 })
  }

  const contextPack = await buildRepositoryContextPack(
    apiKey.repository.id,
    apiKey.repository.fullName,
    task,
    {
      language: body.language,
      fileCategory: body.fileCategory,
      pathPrefix: body.pathPrefix,
    },
    typeof body.maxSnippets === "number" ? body.maxSnippets : 6
  )

  if (!contextPack.ok) {
    return NextResponse.json({ error: contextPack.error }, { status: contextPack.status })
  }

  return NextResponse.json({
    repository: apiKey.repository,
    ...contextPack.data,
  })
}
