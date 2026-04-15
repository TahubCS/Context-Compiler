import { redirect } from "next/navigation"
import Link from "next/link"
import { getWorkspaceRepositories } from "@/lib/db"
import { ScanStatusBadge } from "@/components/features/repositories/scan-status-badge"
import { GitBranch } from "lucide-react"
import { getAuthenticatedAppContext } from "@/lib/app-context"

export default async function RepoIndexPage() {
  const { workspace } = await getAuthenticatedAppContext()
  if (!workspace) return null

  const repositories = await getWorkspaceRepositories(workspace.id)

  if (repositories.length === 1) {
    redirect(`/repo/${repositories[0].id}`)
  }

  if (repositories.length === 0) {
    redirect("/dashboard")
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="text-2xl font-bold text-foreground">Repositories</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a repository to open from {workspace.name}.
      </p>

      <ul className="mt-6 space-y-3">
        {repositories.map((repo) => (
          <li key={repo.id}>
            <Link
              href={`/repo/${repo.id}`}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-3">
                <GitBranch className="size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">{repo.fullName}</p>
                  <p className="text-xs text-muted-foreground">
                    {repo.isPrivate ? "Private" : "Public"}
                    {repo.defaultBranch ? ` | ${repo.defaultBranch}` : ""}
                    {repo.lastIndexedCommitSha ? ` | ${repo.lastIndexedCommitSha.slice(0, 7)}` : ""}
                  </p>
                </div>
              </div>
              <ScanStatusBadge status={repo.scanStatus} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
