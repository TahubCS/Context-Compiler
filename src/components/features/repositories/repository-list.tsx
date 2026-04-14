import Link from "next/link"
import { RepositoryListItem } from "@/lib/db"
import { ScanStatusBadge } from "./scan-status-badge"

type RepositoryListProps = {
  repositories: RepositoryListItem[]
  databaseError: string | null
}

function formatLastScannedAt(date: Date | null) {
  if (!date) return "Never"
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)
}

export function RepositoryList({ repositories, databaseError }: RepositoryListProps) {
  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-foreground">Repositories</h2>
        <p className="text-sm text-muted-foreground">{repositories.length} synced</p>
      </div>

      {databaseError ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Repository list is unavailable while the database connection is down.
        </p>
      ) : null}

      {!databaseError && repositories.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No repositories are synced yet. Use the sync button above to import from GitHub.
        </p>
      ) : null}

      {!databaseError && repositories.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {repositories.map((repository) => (
            <li key={repository.id} className="rounded-lg border border-border bg-background p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <Link
                    href={`/repo/${repository.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {repository.fullName}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {repository.isPrivate ? "Private" : "Public"} repository
                    {repository.defaultBranch
                      ? ` • Default branch: ${repository.defaultBranch}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-col items-start gap-1.5 text-sm text-muted-foreground md:items-end">
                  <ScanStatusBadge status={repository.scanStatus} />
                  {repository.scanStatus === "SCANNING" ? (
                    <p>{repository.filesProcessed} / {repository.filesDiscovered} files</p>
                  ) : null}
                  {repository.scanStatus === "COMPLETED" ? (
                    <p>
                      {repository.filesProcessed} files indexed
                      {repository.lastIndexedCommitSha
                        ? ` | commit ${repository.lastIndexedCommitSha.slice(0, 7)}`
                        : ""}
                    </p>
                  ) : null}
                  <p>Last scanned: {formatLastScannedAt(repository.lastScannedAt)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
