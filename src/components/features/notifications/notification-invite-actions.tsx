"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"

type NotificationInviteActionsProps = {
  inviteId: string
  disabled?: boolean
}

export function NotificationInviteActions({
  inviteId,
  disabled = false,
}: NotificationInviteActionsProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState<"accept" | "decline" | null>(null)

  async function handleAction(action: "accept" | "decline") {
    setIsSubmitting(action)
    try {
      const response = await fetch(`/api/workspaces/invites/${inviteId}/${action}`, {
        method: "POST",
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        toast.error(data.error ?? `Could not ${action} invite.`)
        return
      }

      toast.success(action === "accept" ? "Invite accepted." : "Invite declined.")
      router.refresh()
    } catch {
      toast.error("Could not reach the server.")
    } finally {
      setIsSubmitting(null)
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        onClick={() => handleAction("accept")}
        disabled={disabled || isSubmitting !== null}
      >
        {isSubmitting === "accept" ? "Accepting..." : "Accept"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleAction("decline")}
        disabled={disabled || isSubmitting !== null}
      >
        {isSubmitting === "decline" ? "Declining..." : "Decline"}
      </Button>
    </div>
  )
}
