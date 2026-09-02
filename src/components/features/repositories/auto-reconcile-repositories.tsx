"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

type AutoReconcileRepositoriesProps = {
  enabled: boolean
  lastRepoSyncAt?: string | null
}

const REPO_RECONCILE_STALE_MS = 15 * 60 * 1000

export function AutoReconcileRepositories({enabled, lastRepoSyncAt,}: AutoReconcileRepositoriesProps) {
  const router = useRouter()
  const hasStartedRef = useRef(false)

  useEffect(() => {
    if (!enabled || hasStartedRef.current) {
      return
    }

    if (lastRepoSyncAt) {
      const lastSyncedAt = new Date(lastRepoSyncAt).getTime()
      if (!Number.isNaN(lastSyncedAt) && Date.now() - lastSyncedAt <= REPO_RECONCILE_STALE_MS) {
        return
      }
    }

    hasStartedRef.current = true

    fetch("/api/github-app/reconcile", {
      method: "POST",
    })
      .then(() => {
        router.refresh()
      })
      .catch(() => {})
  }, [enabled, lastRepoSyncAt, router])

  return null
}
