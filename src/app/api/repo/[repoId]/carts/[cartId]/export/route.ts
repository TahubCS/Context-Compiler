import { getSavedCart } from "@/lib/db"
import { formatContextPack } from "@/lib/prompt-packs"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RouteParams = { params: Promise<{ repoId: string; cartId: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { repoId, cartId } = await params
  const { workspace } = await getAuthenticatedAppContext()
  if (!workspace) {
    return new Response("Unauthorized", { status: 401 })
  }

  const cart = await getSavedCart(cartId, repoId, workspace.id)
  if (!cart) {
    return new Response("Saved cart not found", { status: 404 })
  }

  const content = formatContextPack(
    cart.repository.fullName,
    cart.items.map((item) => ({
      filePath: item.filePath,
      chunkIndex: item.chunkIndex,
      language: item.language,
      content: item.contentSnapshot,
    })),
    cart.title
  )

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  })
}
