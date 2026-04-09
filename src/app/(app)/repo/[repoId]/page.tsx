import { notFound } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { Search, ShoppingCart, GitBranch } from "lucide-react"

type RepoPageProps = {
  params: Promise<{ repoId: string }>
}

export default async function RepoPage({ params }: RepoPageProps) {
  const { repoId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const repository = await prisma.repository.findFirst({
    where: { id: repoId, userId: user.id },
    select: { id: true, fullName: true, defaultBranch: true },
  })

  if (!repository) notFound()

  return (
    <div className="flex h-full gap-4">
      {/* Left pane — Chat / Search (60%) */}
      <section className="flex w-3/5 flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Search</h2>
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <GitBranch className="size-3" />
            {repository.defaultBranch ?? "main"}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            Natural language search coming soon.
          </p>
        </div>
      </section>

      {/* Right pane — Context Cart (40%) */}
      <section className="flex w-2/5 flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Context Cart</h2>
          <span className="ml-auto text-xs text-muted-foreground">0 items</span>
        </div>
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">
            Selected code blocks will appear here.
          </p>
        </div>
      </section>
    </div>
  )
}
