import Link from "next/link"
import { WorkspaceRole } from "@prisma/client"
import {
  canCreatePaidWorkspace,
  getUserGitHubConnectionStatus,
  getWorkspaceGitHubConnection,
  isPrismaConnectivityError,
  listWorkspaceInvites,
  listWorkspaceMembers,
} from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { SyncRepositoriesButton } from "@/components/features/repositories/sync-repositories-button"
import { AutoReconcileRepositories } from "@/components/features/repositories/auto-reconcile-repositories"
import { EditProfileDialog } from "@/components/features/settings/edit-profile-dialog"
import { ReconnectGitHubButton } from "@/components/features/settings/reconnect-github-button"
import { CreateWorkspaceDialog } from "@/components/features/workspaces/create-workspace-dialog"
import { InviteMemberDialog } from "@/components/features/workspaces/invite-member-dialog"
import { MemberRoleControls } from "@/components/features/workspaces/member-role-controls"
import { ConnectGitHubAppButton } from "@/components/features/settings/connect-github-app-button"
import { LinkGitHubInstallationDialog } from "@/components/features/settings/link-github-installation-dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CreditCard, Settings2, User, Users } from "lucide-react"
import { LuGithub } from "react-icons/lu"

export default async function SettingsPage() {
  const { user, workspace, isPlatformAdmin } = await getAuthenticatedAppContext()
  if (!user || !workspace) return null

  const displayName =
    user.user_metadata.full_name ?? user.user_metadata.user_name ?? user.email ?? "-"
  const githubUsername: string | null = user.user_metadata.user_name ?? null

  let githubConnectionStatus: "connected" | "needs_reconnect" = "needs_reconnect"
  let members = [] as Awaited<ReturnType<typeof listWorkspaceMembers>>
  let invites = [] as Awaited<ReturnType<typeof listWorkspaceInvites>>
  let canCreateSharedWorkspace = false
  let workspaceGitHubConnection: Awaited<ReturnType<typeof getWorkspaceGitHubConnection>> | null =
    null

  try {
    ;[
      githubConnectionStatus,
      members,
      invites,
      canCreateSharedWorkspace,
      workspaceGitHubConnection,
    ] = await Promise.all([
      getUserGitHubConnectionStatus(user.id),
      listWorkspaceMembers(workspace.id),
      listWorkspaceInvites(workspace.id),
      canCreatePaidWorkspace(user.id),
      getWorkspaceGitHubConnection(workspace.id),
    ])
  } catch (err) {
    if (!isPrismaConnectivityError(err)) throw err
  }

  const needsReconnect = githubConnectionStatus === "needs_reconnect"
  const canManageMembers =
    isPlatformAdmin ||
    workspace.currentUserRole === WorkspaceRole.OWNER ||
    workspace.currentUserRole === WorkspaceRole.ADMIN
  const canManageGitHubConnection = canManageMembers
  const canManageRoles = isPlatformAdmin || workspace.currentUserRole === WorkspaceRole.OWNER
  const teamFeaturesEnabled =
    workspace.subscriptionTier === "TEAM" || workspace.subscriptionTier === "ENTERPRISE"
  const hasGitHubApp = !!workspaceGitHubConnection?.githubInstallationId

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <AutoReconcileRepositories
        enabled={hasGitHubApp}
        lastRepoSyncAt={workspaceGitHubConnection?.lastRepoSyncAt?.toISOString() ?? null}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your profile, GitHub connection, billing, and the active workspace.
          </p>
        </div>
        {canCreateSharedWorkspace ? <CreateWorkspaceDialog /> : null}
      </div>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Profile</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Name</p>
            <p className="mt-0.5 text-sm text-foreground">{displayName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
            <p className="mt-0.5 text-sm text-foreground">{user.email ?? "-"}</p>
          </div>
        </div>
        <div className="mt-4">
          <EditProfileDialog currentName={displayName} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Active Workspace</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">{workspace.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Type</p>
            <p className="mt-0.5 text-sm capitalize text-foreground">
              {workspace.type.toLowerCase()}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan</p>
            <p className="mt-0.5 text-sm capitalize text-foreground">
              {workspace.subscriptionTier.toLowerCase()}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Your Role</p>
            <p className="mt-0.5 text-sm capitalize text-foreground">
              {workspace.currentUserRole.toLowerCase()}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/billing">Manage Billing</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/notifications">Open Notifications</Link>
          </Button>
        </div>
        {!teamFeaturesEnabled && workspace.type === "TEAM" ? (
          <Alert className="mt-4">
            <AlertTriangle className="size-4" />
            <AlertDescription>
              This shared workspace is not on a Team or Enterprise plan yet. Upgrade billing to
              unlock invites and collaboration features.
            </AlertDescription>
          </Alert>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Workspace Members</h2>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {members.length} member{members.length === 1 ? "" : "s"} in this workspace.
          </p>
          {canManageMembers && teamFeaturesEnabled ? (
            <InviteMemberDialog workspaceId={workspace.id} />
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
            >
              <div>
                <p className="font-medium text-foreground">
                  {member.user.name ?? member.user.email}
                </p>
                <p className="text-sm text-muted-foreground">{member.user.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm capitalize text-muted-foreground">
                  {member.role.toLowerCase()}
                </span>
                {canManageRoles || (canManageMembers && member.role === "MEMBER") ? (
                  <MemberRoleControls
                    workspaceId={workspace.id}
                    memberUserId={member.user.id}
                    currentRole={member.role}
                    disabled={!teamFeaturesEnabled}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Pending Invites</h2>
        </div>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites for this workspace.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="rounded-lg border border-border p-4 text-sm text-muted-foreground"
              >
                <p className="font-medium text-foreground">{invite.email}</p>
                <p>
                  Invited as {invite.role.toLowerCase()} by{" "}
                  {invite.invitedBy.name ?? invite.invitedBy.email}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <LuGithub className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">GitHub</h2>
        </div>

        {hasGitHubApp ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>
                GitHub App sync is connected for this workspace
                {workspaceGitHubConnection?.githubInstallationAccountLogin
                  ? ` via ${workspaceGitHubConnection.githubInstallationAccountLogin}`
                  : ""}.
                {workspaceGitHubConnection?.lastRepoSyncAt
                  ? ` Last repository sync: ${workspaceGitHubConnection.lastRepoSyncAt.toLocaleString()}.`
                  : " Repository sync will happen automatically after install and via webhooks."}
              </AlertDescription>
            </Alert>
            {canManageGitHubConnection ? (
              <div className="w-full md:w-fit">
                <SyncRepositoriesButton label="Sync now" />
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">
              OAuth stays enabled for login during transition, but repository inventory and scans
              for this workspace now use the GitHub App connection first.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertDescription>
                Connect the GitHub App for this workspace to enable automatic repository sync from
                webhooks, background reconciliation, and workspace-backed scans.
              </AlertDescription>
            </Alert>
            {canManageGitHubConnection ? (
              <>
                <div className="w-full md:w-fit">
                  <ConnectGitHubAppButton workspaceId={workspace.id} />
                </div>
                <div className="w-full md:w-fit">
                  <LinkGitHubInstallationDialog workspaceId={workspace.id} />
                </div>
                <div className="w-full md:w-fit">
                  <SyncRepositoriesButton label="Fallback OAuth Sync" />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ask a workspace owner or admin to connect the GitHub App for automatic sync.
              </p>
            )}
          </div>
        )}

        {githubUsername ? (
          <p className="mb-3 text-sm text-muted-foreground">
            Connected as <span className="font-medium text-foreground">@{githubUsername}</span>.
          </p>
        ) : null}

        {!hasGitHubApp && needsReconnect ? (
          <div className="flex flex-col gap-4">
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                Your GitHub OAuth token is missing or expired. Reconnect GitHub if this workspace
                still relies on OAuth fallback for syncing repositories or starting scans.
              </AlertDescription>
            </Alert>
            <ReconnectGitHubButton redirectPath="/settings" />
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Billing</h2>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/billing">Manage Billing</Link>
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Billing is now scoped to the active workspace. Upgrade the workspace you want to use for
          collaboration.
        </p>
      </section>
    </div>
  )
}
