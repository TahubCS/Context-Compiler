import { NextResponse } from "next/server"
import { deleteAnswerSession, getAnswerSession, getRepository } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = { params: Promise<{ repoId: string; answerId: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { repoId, answerId } = await params
  const { workspace } = await getAuthenticatedAppContext()
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repository = await getRepository(repoId, workspace.id)
  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  const answerSession = await getAnswerSession(answerId, repoId, workspace.id)
  if (!answerSession) {
    return NextResponse.json({ error: "Answer session not found" }, { status: 404 })
  }

  return NextResponse.json({ answerSession })
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { repoId, answerId } = await params
  const { workspace } = await getAuthenticatedAppContext()
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const deleted = await deleteAnswerSession(answerId, repoId, workspace.id)
  if (!deleted) {
    return NextResponse.json({ error: "Answer session not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
