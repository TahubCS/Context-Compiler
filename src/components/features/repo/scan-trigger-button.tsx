"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ScanLine } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

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
      const data = (await res.json()) as {
        error?: string
        status?: string
        message?: string
      }

      if (!res.ok) {
        toast.error(data.error ?? "Failed to start scan.")
        return
      }

      if (data.status === "up_to_date") {
        toast.info(data.message ?? "Repository is already up to date.")
        router.refresh()
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
      {isLoading ? "Queuing..." : "Scan Repository"}
    </Button>
  )
}
