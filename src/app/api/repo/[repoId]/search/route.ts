import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { getRepository, searchCodeDocuments, isPrismaConnectivityError } from "@/lib/db"

type RouteParams = { params: Promise<{ repoId: string }> }

export async function POST(req: Request, { params }: RouteParams) {
  const { repoId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { query?: string }
  try {
    body = (await req.json()) as { query?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const query = body.query?.trim()
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 })

  const repo = await getRepository(repoId, user.id)
  if (!repo) return NextResponse.json({ error: "Repository not found" }, { status: 404 })

  const backendUrl = process.env.AI_BACKEND_URL
  if (!backendUrl)
    return NextResponse.json({ error: "AI backend not configured" }, { status: 503 })

  let embedding: number[]
  try {
    const embedRes = await fetch(`${backendUrl}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: query }),
      signal: AbortSignal.timeout(15000),
    })
    if (!embedRes.ok) {
      return NextResponse.json({ error: "Embedding service error" }, { status: 502 })
    }
    const data = (await embedRes.json()) as { embedding: number[] }
    embedding = data.embedding
  } catch {
    return NextResponse.json({ error: "AI backend unreachable" }, { status: 503 })
  }

  try {
    const results = await searchCodeDocuments(repoId, embedding)
    return NextResponse.json({ results })
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }
}
