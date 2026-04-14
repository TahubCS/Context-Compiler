import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getRepository } from "@/lib/db"

type RouteParams = { params: Promise<{ repoId: string }> }

export async function POST(req: Request, { params }: RouteParams) {
  const { repoId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { question?: string; limit?: number }
  try {
    body = (await req.json()) as { question?: string; limit?: number }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const question = body.question?.trim()
  if (!question) {
    return NextResponse.json({ error: "question is required" }, { status: 400 })
  }

  const repository = await getRepository(repoId, user.id)
  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  const backendUrl = process.env.AI_BACKEND_URL
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
