import { notFound } from "next/navigation"
import { failStaleScanJobForRepository, getLatestScanJobForRepository, getRepository } from "@/lib/db"
import { ShoppingCart, GitBranch, AlertCircle, History, Sparkles } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScanStatusBadge } from "@/components/features/repositories/scan-status-badge"
import { ScanTriggerButton } from "@/components/features/repo/scan-trigger-button"
import { ScanPoller } from "@/components/features/repo/scan-poller"
import { SearchPane } from "@/components/features/repo/search-pane"
import { ContextCartPane } from "@/components/features/repo/context-cart-pane"
import { CURRENT_INDEX_FORMAT_VERSION, isRepositoryIndexOutdated } from "@/lib/index-format"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type RepoPageProps = {
  params: Promise<{ repoId: string }>
}

export default async function RepoPage({ params }: RepoPageProps) {
  const { repoId } = await params
  const { user, workspace } = await getAuthenticatedAppContext()
  if (!user || !workspace) return null

  await failStaleScanJobForRepository(repoId)

  const repository = await getRepository(repoId, workspace.id)
  if (!repository) notFound()
  const latestScanJob = await getLatestScanJobForRepository(repoId)

  const isScanning = repository.scanStatus === "SCANNING"
  const isBusy = repository.scanStatus === "QUEUED" || isScanning
  const commitSha = repository.lastIndexedCommitSha
  const shortCommitSha = commitSha ? commitSha.slice(0, 7) : null
  const indexOutdated = isRepositoryIndexOutdated(repository.indexFormatVersion)

  return (
    <div className="flex min-h-full flex-col gap-4">
      <ScanPoller active={isBusy} />

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-foreground">{repository.fullName}</h1>
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{repository.defaultBranch ?? "main"}</span>
        </div>
        {shortCommitSha ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <History className="size-4" />
            <span>
              Indexed at {shortCommitSha} · format v{repository.indexFormatVersion ?? 1}/
              {CURRENT_INDEX_FORMAT_VERSION}
            </span>
          </div>
        ) : null}
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

      {repository.scanStatus === "FAILED" && repository.errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{repository.errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {repository.scanStatus === "COMPLETED" && repository.errorMessage ? (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertDescription>{repository.errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {indexOutdated ? (
        <Alert>
          <AlertCircle className="size-4" />
          <AlertDescription>
            This repository uses an older retrieval index. Re-scan it to enable smarter chunking,
            path/category filters, and better answer grounding.
          </AlertDescription>
        </Alert>
      ) : null}

      {latestScanJob ? (
        <div className="text-xs text-muted-foreground">
          Latest scan job {latestScanJob.id.slice(0, 8)}
          {latestScanJob.indexedCommitSha
            ? ` | commit ${latestScanJob.indexedCommitSha.slice(0, 7)}`
            : ""}
        </div>
      ) : null}

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

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,1fr)]">
        <section className="flex w-full flex-col gap-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Ask This Repository</h2>
          </div>
          <SearchPane
            repoId={repoId}
            repositoryName={repository.fullName}
            indexOutdated={indexOutdated}
          />
        </section>

        <section className="flex w-full flex-col gap-4 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Context Cart</h2>
          </div>
          <ContextCartPane repoId={repoId} repositoryName={repository.fullName} />
        </section>
      </div>
    </div>
  )
}
