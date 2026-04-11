"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

type ScanPollerProps = {
  /** Poll while true (QUEUED or SCANNING). Stops automatically when false. */
  active: boolean
  /** Interval in milliseconds between refreshes. Defaults to 3 s. */
  intervalMs?: number
}

/**
 * Invisible client component that calls router.refresh() on a timer
 * while a scan is in progress. Once `active` becomes false (scan
 * completed / failed) the interval is cleared automatically.
 *
 * This is the idiomatic App Router pattern for live-updating RSC data
 * without a full client-side state layer.
 */
export function ScanPoller({ active, intervalMs = 3000 }: ScanPollerProps) {
  const router = useRouter()

  useEffect(() => {
    if (!active) return

    const id = setInterval(() => {
      router.refresh()
    }, intervalMs)

    return () => clearInterval(id)
  }, [active, intervalMs, router])

  return null
}
