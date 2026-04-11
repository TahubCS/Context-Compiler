import { notFound } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { getRepository } from "@/lib/db"
import { Search, ShoppingCart, GitBranch } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { ScanStatusBadge } from "@/components/features/repositories/scan-status-badge"
import { ScanTriggerButton } from "@/components/features/repo/scan-trigger-button"
import { ScanPoller } from "@/components/features/repo/scan-poller"

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

  const repository = await getRepository(repoId, user.id)
  if (!repository) notFound()

  const isScanning = repository.scanStatus === "SCANNING"
  const isBusy = repository.scanStatus === "QUEUED" || isScanning

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Poll for status updates while scan is in progress */}
      <ScanPoller active={isBusy} />

      {/* Repo header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">{repository.fullName}</h1>
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{repository.defaultBranch ?? "main"}</span>
        </div>
        <ScanStatusBadge status={repository.scanStatus} />
        {isScanning && repository.filesDiscovered > 0 ? (
          <span className="text-xs text-muted-foreground">
            {repository.filesProcessed} / {repository.filesDiscovered} files
          </span>
        ) : null}
        <div className="ml-auto">
          <ScanTriggerButton repoId={repoId} disabled={isBusy} />
        </div>
      </div>

      {isScanning ? (
        <Progress
          value={
            repository.filesDiscovered > 0
              ? Math.round((repository.filesProcessed / repository.filesDiscovered) * 100)
              : repository.scanProgress
          }
          className="h-1.5"
        />
      ) : null}

      {/* Split pane */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Left pane — Search (60%) */}
        <section className="flex w-3/5 flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Search</h2>
          </div>
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border">
            <p className="text-sm text-muted-foreground">Natural language search coming soon.</p>
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
            <p className="text-sm text-muted-foreground">Selected code blocks will appear here.</p>
          </div>
        </section>
      </div>
    </div>
  )
}
