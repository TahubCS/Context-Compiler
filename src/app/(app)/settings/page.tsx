import Link from "next/link"
import { createClient } from "@/utils/supabase/server"
import {
  getUserGitHubConnectionStatus,
  getUserSubscriptionTier,
  isPrismaConnectivityError,
} from "@/lib/db"
import { SyncRepositoriesButton } from "@/components/features/repositories/sync-repositories-button"
import { EditProfileDialog } from "@/components/features/settings/edit-profile-dialog"
import { ReconnectGitHubButton } from "@/components/features/settings/reconnect-github-button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { User, CreditCard, AlertTriangle } from "lucide-react"
import { LuGithub } from "react-icons/lu"

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const displayName =
    user.user_metadata.full_name ?? user.user_metadata.user_name ?? user.email ?? "-"
  const githubUsername: string | null = user.user_metadata.user_name ?? null

  let subscriptionTier: string | null = null
  let githubConnectionStatus: "connected" | "needs_reconnect" = "needs_reconnect"

  try {
    const [tier, connectionStatus] = await Promise.all([
      getUserSubscriptionTier(user.id),
      getUserGitHubConnectionStatus(user.id),
    ])
    subscriptionTier = tier
    githubConnectionStatus = connectionStatus
  } catch (err) {
    if (!isPrismaConnectivityError(err)) throw err
  }

  const needsReconnect = githubConnectionStatus === "needs_reconnect"

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Profile</h2>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Name</p>
            <p className="mt-0.5 text-sm text-foreground">{displayName}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
            <p className="mt-0.5 text-sm text-foreground">{user.email ?? "-"}</p>
          </div>
          {subscriptionTier ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan</p>
              <p className="mt-0.5 text-sm font-medium capitalize text-foreground">
                {subscriptionTier.toLowerCase()}
              </p>
            </div>
          ) : null}
        </div>
        <div className="mt-4">
          <EditProfileDialog currentName={displayName} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <LuGithub className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">GitHub</h2>
        </div>

        {githubUsername ? (
          <p className="mb-3 text-sm text-muted-foreground">
            Connected as <span className="font-medium text-foreground">@{githubUsername}</span>.
          </p>
        ) : null}

        {needsReconnect ? (
          <div className="flex flex-col gap-4">
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                Your GitHub token is missing or expired. Reconnect GitHub before syncing
                repositories or starting new scans.
              </AlertDescription>
            </Alert>
            <ReconnectGitHubButton redirectPath="/settings" />
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              Your encrypted GitHub token is available for repository sync and scanning.
            </p>
            <SyncRepositoriesButton />
          </>
        )}
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
          View your subscription plan and manage payment details.
        </p>
      </section>
    </div>
  )
}
