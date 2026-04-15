import { NextResponse } from "next/server"
import { createAnswerSession, getRepository, listAnswerSessions } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = { params: Promise<{ repoId: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { repoId } = await params
  const { user, workspace } = await getAuthenticatedAppContext()
  if (!user || !workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repository = await getRepository(repoId, workspace.id)
  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  const answers = await listAnswerSessions(repoId, workspace.id)
  return NextResponse.json({ answers })
}

export async function POST(req: Request, { params }: RouteParams) {
  const { repoId } = await params
  const { user, workspace } = await getAuthenticatedAppContext()
  if (!user || !workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repository = await getRepository(repoId, workspace.id)
  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  let body: {
    question?: string
    answer?: string
    citations?: Array<{
      id?: string
      filePath: string
      chunkIndex: number
      language?: string | null
      content: string
      score?: number | null
    }>
  }

  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const question = body.question?.trim()
  const answer = body.answer?.trim()
  if (!question || !answer) {
    return NextResponse.json({ error: "question and answer are required" }, { status: 400 })
  }

  const citations = (body.citations ?? []).map((citation) => ({
    codeDocumentId: citation.id ?? null,
    filePath: citation.filePath,
    chunkIndex: citation.chunkIndex,
    language: citation.language ?? null,
    contentSnapshot: citation.content,
    score: citation.score ?? null,
  }))

  const answerSession = await createAnswerSession(repoId, user.id, workspace.id, {
    question,
    answer,
    citations,
  })

  return NextResponse.json({ answerSession }, { status: 201 })
}
