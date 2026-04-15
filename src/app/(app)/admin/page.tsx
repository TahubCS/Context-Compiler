import { redirect } from "next/navigation"
import { listAdminAuditLogs, listAdminUsers, listAdminWorkspaces } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { Shield, Users, Building2, ScrollText } from "lucide-react"

export default async function AdminPage() {
  const { isPlatformAdmin } = await getAuthenticatedAppContext()
  if (!isPlatformAdmin) {
    redirect("/dashboard")
  }

  const [users, workspaces, auditLogs] = await Promise.all([
    listAdminUsers(50),
    listAdminWorkspaces(50),
    listAdminAuditLogs(50),
  ])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Shield className="size-5 text-primary" />
          Platform Admin
        </h1>
        <p className="text-sm text-muted-foreground">
          Global visibility into users, workspaces, memberships, and audit activity.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Users</h2>
          </div>
          <p className="mt-3 text-3xl font-bold text-foreground">{users.length}</p>
          <p className="text-sm text-muted-foreground">Latest visible user records</p>
        </section>
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Workspaces</h2>
          </div>
          <p className="mt-3 text-3xl font-bold text-foreground">{workspaces.length}</p>
          <p className="text-sm text-muted-foreground">Personal and shared workspaces</p>
        </section>
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <ScrollText className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Audit Logs</h2>
          </div>
          <p className="mt-3 text-3xl font-bold text-foreground">{auditLogs.length}</p>
          <p className="text-sm text-muted-foreground">Most recent audit events</p>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold text-foreground">Users</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4 font-medium">Email</th>
                <th className="pb-2 pr-4 font-medium">Name</th>
                <th className="pb-2 pr-4 font-medium">Admin</th>
                <th className="pb-2 pr-4 font-medium">Memberships</th>
                <th className="pb-2 font-medium">Owned Workspaces</th>
              </tr>
            </thead>
            <tbody>
              {users.map((entry) => (
                <tr key={entry.id} className="border-t border-border/60">
                  <td className="py-3 pr-4 text-foreground">{entry.email}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{entry.name ?? "-"}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {entry.isPlatformAdmin ? "Yes" : "No"}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {entry._count.workspaceMemberships}
                  </td>
                  <td className="py-3 text-muted-foreground">{entry._count.ownedWorkspaces}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold text-foreground">Workspaces</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="pb-2 pr-4 font-medium">Workspace</th>
                <th className="pb-2 pr-4 font-medium">Plan</th>
                <th className="pb-2 pr-4 font-medium">Owner</th>
                <th className="pb-2 pr-4 font-medium">Members</th>
                <th className="pb-2 pr-4 font-medium">Repos</th>
                <th className="pb-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((entry) => (
                <tr key={entry.id} className="border-t border-border/60">
                  <td className="py-3 pr-4 text-foreground">
                    {entry.name}
                    <span className="ml-2 text-xs uppercase text-muted-foreground">
                      {entry.type}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{entry.subscriptionTier}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {entry.owner.name ?? entry.owner.email}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{entry._count.members}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{entry._count.repositories}</td>
                  <td className="py-3 text-muted-foreground">
                    {new Date(entry.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold text-foreground">Recent Audit Logs</h2>
        <div className="flex flex-col gap-3">
          {auditLogs.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-foreground">{entry.eventType}</p>
                  <p className="text-sm text-muted-foreground">
                    {entry.workspace?.name ?? "Global"} | {entry.entityType}
                    {entry.entityId ? ` | ${entry.entityId.slice(0, 8)}` : ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
