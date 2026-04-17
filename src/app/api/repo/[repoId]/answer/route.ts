import { NextResponse } from "next/server"
import { getRepository } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { answerRepositoryQuestion } from "@/lib/repository-retrieval"

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

  const answer = await answerRepositoryQuestion(
    repoId,
    question,
    {
      language: body.language,
      fileCategory: body.fileCategory,
      pathPrefix: body.pathPrefix,
    },
    typeof body.limit === "number" ? body.limit : 6
  )

  if (!answer.ok) {
    return NextResponse.json({ error: answer.error }, { status: answer.status })
  }

  return NextResponse.json(answer.data)
}
