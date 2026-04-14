import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { createSavedCart, getRepository, listSavedCarts } from "@/lib/db"

type RouteParams = { params: Promise<{ repoId: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { repoId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repository = await getRepository(repoId, user.id)
  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  const carts = await listSavedCarts(repoId, user.id)
  return NextResponse.json({ carts })
}

export async function POST(req: Request, { params }: RouteParams) {
  const { repoId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repository = await getRepository(repoId, user.id)
  if (!repository) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 })
  }

  let body: {
    title?: string
    description?: string | null
    items?: Array<{
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

  const title = body.title?.trim()
  if (!title || !body.items?.length) {
    return NextResponse.json({ error: "title and items are required" }, { status: 400 })
  }

  const cart = await createSavedCart(repoId, user.id, {
    title,
    description: body.description?.trim() || null,
    items: body.items.map((item) => ({
      codeDocumentId: item.id ?? null,
      filePath: item.filePath,
      chunkIndex: item.chunkIndex,
      language: item.language ?? null,
      contentSnapshot: item.content,
      score: item.score ?? null,
    })),
  })

  return NextResponse.json({ cart }, { status: 201 })
}
