import { NextResponse } from "next/server"
import { deleteSavedCart, getSavedCart, updateSavedCart } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = { params: Promise<{ repoId: string; cartId: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { repoId, cartId } = await params
  const { workspace } = await getAuthenticatedAppContext()
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const cart = await getSavedCart(cartId, repoId, workspace.id)
  if (!cart) {
    return NextResponse.json({ error: "Saved cart not found" }, { status: 404 })
  }

  return NextResponse.json({ cart })
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { repoId, cartId } = await params
  const { workspace } = await getAuthenticatedAppContext()
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

  const cart = await updateSavedCart(cartId, repoId, workspace.id, {
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

  if (!cart) {
    return NextResponse.json({ error: "Saved cart not found" }, { status: 404 })
  }

  return NextResponse.json({ cart })
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const { repoId, cartId } = await params
  const { workspace } = await getAuthenticatedAppContext()
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const deleted = await deleteSavedCart(cartId, repoId, workspace.id)
  if (!deleted) {
    return NextResponse.json({ error: "Saved cart not found" }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
