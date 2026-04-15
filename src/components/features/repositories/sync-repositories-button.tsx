"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"

type SyncRepositoriesResponse = {
  syncedCount?: number
  source?: "github-app" | "oauth"
  error?: string
}

type SyncRepositoriesButtonProps = {
  label?: string
}

export function SyncRepositoriesButton({
  label = "Sync GitHub Repositories",
}: SyncRepositoriesButtonProps) {
  const router = useRouter()
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  const handleSync = async () => {
    try {
      setIsSyncing(true)
      setSyncError(null)
      setSyncMessage(null)

      const response = await fetch("/api/repositories/sync", {
        method: "POST",
      })

      const payload = (await response.json().catch(() => null)) as SyncRepositoriesResponse | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to sync repositories.")
      }

      const syncedCount = payload?.syncedCount ?? 0
      setSyncMessage(
        payload?.source === "github-app"
          ? `Reconciled ${syncedCount} repositories from the GitHub App installation.`
          : `Synced ${syncedCount} repositories from GitHub.`
      )

      router.refresh()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to sync repositories from GitHub."
      setSyncError(message)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <Button onClick={handleSync} disabled={isSyncing}>
        {isSyncing ? "Syncing Repositories..." : label}
      </Button>
      {syncMessage ? <p className="text-sm text-muted-foreground">{syncMessage}</p> : null}
      {syncError ? <p className="text-sm text-destructive">{syncError}</p> : null}
    </div>
  )
}
