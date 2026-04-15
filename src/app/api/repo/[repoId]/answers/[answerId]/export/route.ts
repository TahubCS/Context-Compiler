import { getAnswerSession, getRepository } from "@/lib/db"
import { formatAnswerPack } from "@/lib/prompt-packs"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = { params: Promise<{ repoId: string; answerId: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { repoId, answerId } = await params
  const { workspace } = await getAuthenticatedAppContext()
  if (!workspace) {
    return new Response("Unauthorized", { status: 401 })
  }

  const repository = await getRepository(repoId, workspace.id)
  if (!repository) {
    return new Response("Repository not found", { status: 404 })
  }

  const answerSession = await getAnswerSession(answerId, repoId, workspace.id)
  if (!answerSession) {
    return new Response("Answer session not found", { status: 404 })
  }

  const content = formatAnswerPack(
    answerSession.repository.fullName,
    answerSession.question,
    answerSession.answer,
    answerSession.citations.map((citation) => ({
      filePath: citation.filePath,
      chunkIndex: citation.chunkIndex,
      language: citation.language,
      content: citation.contentSnapshot,
    }))
  )

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}
