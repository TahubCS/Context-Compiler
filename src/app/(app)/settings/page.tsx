import Link from "next/link"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { SyncRepositoriesButton } from "@/components/features/repositories/sync-repositories-button"
import { User, CreditCard } from "lucide-react"
import { LuGithub } from "react-icons/lu";

function isPrismaConnectivityError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("tenant or user not found") ||
    message.includes("driveradaptererror") ||
    message.includes("can't reach database server") ||
    message.includes("connection")
  )
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const displayName =
    user.user_metadata.full_name ?? user.user_metadata.user_name ?? user.email ?? "—"
  const githubUsername: string | null = user.user_metadata.user_name ?? null

  let subscriptionTier: string | null = null

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { subscriptionTier: true },
    })
    subscriptionTier = dbUser?.subscriptionTier ?? null
  } catch (err) {
    if (!isPrismaConnectivityError(err)) throw err
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">Settings</h1>

      {/* Profile */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Profile</h2>
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Name</p>
            <p className="mt-0.5 text-sm text-foreground">{displayName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Email</p>
            <p className="mt-0.5 text-sm text-foreground">{user.email ?? "—"}</p>
          </div>
          {subscriptionTier && (
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Plan</p>
              <p className="mt-0.5 text-sm font-medium text-foreground capitalize">
                {subscriptionTier.toLowerCase()}
              </p>
            </div>
          )}
        </div>
        <div className="mt-4">
          <Button variant="outline" size="sm" disabled>
            Edit Profile — Coming Soon
          </Button>
        </div>
      </section>

      {/* GitHub */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <LuGithub className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">GitHub</h2>
        </div>
        {githubUsername && (
          <p className="mb-3 text-sm text-muted-foreground">
            Connected as{" "}
            <span className="font-medium text-foreground">@{githubUsername}</span>.
            Your OAuth token is managed automatically by Supabase.
          </p>
        )}
        <SyncRepositoriesButton />
      </section>

      {/* Billing shortcut */}
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
