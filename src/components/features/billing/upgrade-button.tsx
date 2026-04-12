"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

type UpgradeButtonProps = {
  tier: string
  label: string
  disabled?: boolean
}

export function UpgradeButton({ tier, label, disabled }: UpgradeButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  async function handleUpgrade() {
    setIsLoading(true)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not start checkout.")
        return
      }
      window.location.assign(data.url)
    } catch {
      toast.error("Could not reach the server.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleUpgrade}
      disabled={disabled || isLoading}
      className="shrink-0"
    >
      {isLoading ? "Redirecting…" : label}
    </Button>
  )
}
