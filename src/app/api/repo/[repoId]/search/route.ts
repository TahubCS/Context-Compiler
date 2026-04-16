import { NextResponse } from "next/server"
import { getRepository } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { getAiBackendUrl } from "@/lib/runtime-urls"

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

  const backendUrl = getAiBackendUrl()
  if (!backendUrl)
    return NextResponse.json({ error: "AI backend not configured" }, { status: 503 })

  try {
    const searchResponse = await fetch(`${backendUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository_id: repoId,
        query,
        limit: 10,
        language: body.language?.trim() || null,
        file_category: body.fileCategory?.trim() || null,
        path_prefix: body.pathPrefix?.trim() || null,
      }),
      signal: AbortSignal.timeout(30000),
    })

    const data = (await searchResponse.json()) as {
      results?: unknown[]
      detail?: string
    }

    if (!searchResponse.ok) {
      return NextResponse.json(
        { error: data.detail ?? "Search failed." },
        { status: searchResponse.status === 400 ? 400 : 502 }
      )
    }

    return NextResponse.json({ results: data.results ?? [] })
  } catch {
    return NextResponse.json({ error: "AI backend unreachable" }, { status: 503 })
  }
}
