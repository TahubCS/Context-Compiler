"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export function ManageBillingButton() {
  const [isLoading, setIsLoading] = useState(false)

  async function handleManage() {
    setIsLoading(true)
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" })
      const data = (await res.json()) as { url?: string; error?: string }
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Could not open billing portal.")
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
    <Button variant="outline" size="sm" onClick={handleManage} disabled={isLoading}>
      {isLoading ? "Redirecting…" : "Manage Billing"}
    </Button>
  )
}
