import { NextResponse } from "next/server"
import { getRepository } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { searchRepositoryContext } from "@/lib/repository-retrieval"

type RouteParams = { params: Promise<{ repoId: string }> }

type RetrievalFilters = {
  language?: string
  fileCategory?: string
  pathPrefix?: string
}

export async function POST(req: Request, { params }: RouteParams) {
  const { repoId } = await params
  const { workspace } = await getAuthenticatedAppContext()
  if (!workspace) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { query?: string } & RetrievalFilters
  try {
    body = (await req.json()) as { query?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const query = body.query?.trim()
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 })

  const repo = await getRepository(repoId, workspace.id)
  if (!repo) return NextResponse.json({ error: "Repository not found" }, { status: 404 })

  const search = await searchRepositoryContext(
    repoId,
    query,
    {
      language: body.language,
      fileCategory: body.fileCategory,
      pathPrefix: body.pathPrefix,
    },
    10
  )

  if (!search.ok) {
    return NextResponse.json({ error: search.error }, { status: search.status })
  }

  return NextResponse.json({ results: search.data })
}
