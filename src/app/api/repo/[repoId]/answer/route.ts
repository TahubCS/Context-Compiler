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
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { question?: string; limit?: number } & RetrievalFilters
  try {
    body = (await req.json()) as { question?: string; limit?: number }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const question = body.question?.trim()
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 })
  }

  const repository = await getRepository(repoId, workspace.id)
  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  const backendUrl = getAiBackendUrl()
  if (!backendUrl) {
    return NextResponse.json({ error: "AI backend not configured" }, { status: 503 })
  }

  try {
    const answerResponse = await fetch(`${backendUrl}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository_id: repoId,
        question,
        limit: typeof body.limit === "number" ? body.limit : 6,
        language: body.language?.trim() || null,
        file_category: body.fileCategory?.trim() || null,
        path_prefix: body.pathPrefix?.trim() || null,
      }),
      signal: AbortSignal.timeout(30000),
    })

    const data = (await answerResponse.json()) as {
      answer?: string
      citations?: Array<{
        id: string
        filePath: string
        chunkIndex: number
        language: string | null
        content: string
        score: number
      }>
      detail?: string
    }

    if (!answerResponse.ok) {
      return NextResponse.json(
        { error: data.detail ?? "Answer generation failed." },
        { status: answerResponse.status === 400 ? 400 : 502 }
      )
    }

    return NextResponse.json({
      answer: data.answer ?? "",
      citations: data.citations ?? [],
    })
  } catch {
    return NextResponse.json({ error: "AI backend unreachable" }, { status: 503 })
  }
}
