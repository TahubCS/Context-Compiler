import { NextResponse } from "next/server"
import { authenticateMcpRequest } from "@/lib/mcp-request"
import { answerRepositoryQuestion } from "@/lib/repository-retrieval"

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

  let body: { question?: string; limit?: number } & RetrievalFilters
  try {
    body = (await req.json()) as { question?: string; limit?: number } & RetrievalFilters
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const question = body.question?.trim()
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 })
  }

  const answer = await answerRepositoryQuestion(
    apiKey.repository.id,
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

  return NextResponse.json({
    repository: apiKey.repository,
    ...answer.data,
  })
}
