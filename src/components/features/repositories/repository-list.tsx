import { RepositoryListItem } from "@/lib/db"

type RepositoryListProps = {
  repositories: RepositoryListItem[]
  databaseError: string | null
}

function formatScanStatus(status: RepositoryListItem["scanStatus"]) {
  return status.toLowerCase().replaceAll("_", " ")
}

function formatLastScannedAt(date: Date | null) {
  if (!date) {
    return "Never"
  }

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
                  <a
                    href={repository.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    {repository.fullName}
                  </a>
                  <p className="text-sm text-muted-foreground">
                    {repository.isPrivate ? "Private" : "Public"} repository
                    {repository.defaultBranch
                      ? ` • Default branch: ${repository.defaultBranch}`
                      : ""}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>Status: {formatScanStatus(repository.scanStatus)}</p>
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
