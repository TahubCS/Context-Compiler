import { createClient } from "@/utils/supabase/server"
import { getAnswerSession, getRepository } from "@/lib/db"
import { formatAnswerPack } from "@/lib/prompt-packs"

type RouteParams = { params: Promise<{ repoId: string; answerId: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { repoId, answerId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const repository = await getRepository(repoId, user.id)
  if (!repository) {
    return new Response("Repository not found", { status: 404 })
  }

  const answerSession = await getAnswerSession(answerId, repoId, user.id)
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
