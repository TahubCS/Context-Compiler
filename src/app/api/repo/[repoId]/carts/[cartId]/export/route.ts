import { createClient } from "@/utils/supabase/server"
import { getSavedCart } from "@/lib/db"
import { formatContextPack } from "@/lib/prompt-packs"

type RouteParams = { params: Promise<{ repoId: string; cartId: string }> }

export async function GET(_req: Request, { params }: RouteParams) {
  const { repoId, cartId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response("Unauthorized", { status: 401 })
  }

  const cart = await getSavedCart(cartId, repoId, user.id)
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
