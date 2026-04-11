"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ScanLine } from "lucide-react"
import { toast } from "sonner"

type ScanTriggerButtonProps = {
  repoId: string
  disabled?: boolean
}

export function ScanTriggerButton({ repoId, disabled }: ScanTriggerButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  async function handleScan() {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/repo/${repoId}/scan`, { method: "POST" })
      const data = (await res.json()) as { error?: string }

      if (!res.ok) {
        toast.error(data.error ?? "Failed to start scan.")
        return
      }

      toast.success("Scan queued. This may take a few minutes.")
      router.refresh()
    } catch {
      toast.error("Could not reach the server. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Button onClick={handleScan} disabled={disabled || isLoading} size="sm">
      <ScanLine className="size-4" />
      {isLoading ? "Queuing…" : "Scan Repository"}
    </Button>
  )
}
