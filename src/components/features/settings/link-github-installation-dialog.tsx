"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type LinkGitHubInstallationDialogProps = {
  workspaceId: string
}

function extractInstallationId(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^\d+$/.test(trimmed)) {
    return trimmed
  }

  const match = trimmed.match(/\/installations\/(\d+)(?:\/|$)/)
  return match?.[1] ?? null
}

export function LinkGitHubInstallationDialog({
  workspaceId,
}: LinkGitHubInstallationDialogProps) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const parsedInstallationId = useMemo(() => extractInstallationId(value), [value])

  async function handleSubmit() {
    if (!parsedInstallationId) {
      toast.error("Enter a GitHub installation ID or a GitHub installation settings URL.")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/github-app/link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceId,
          installationId: parsedInstallationId,
        }),
      })

      const data = (await response.json()) as { error?: string }

      if (!response.ok) {
        toast.error(data.error ?? "Could not link the GitHub App installation.")
        return
      }

      toast.success("GitHub App installation linked to this workspace.")
      setOpen(false)
      window.location.reload()
    } catch {
      toast.error("Could not reach the server.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Link Existing Installation</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Existing GitHub Installation</DialogTitle>
          <DialogDescription>
            Use this if the GitHub App is already installed on GitHub but did not attach itself to
            this workspace automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="github-installation-id">Installation ID or installation URL</Label>
          <Input
            id="github-installation-id"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="12345678 or https://github.com/settings/installations/12345678"
          />
          <p className="text-sm text-muted-foreground">
            You can find this in GitHub by opening the installed app and clicking{" "}
            <span className="font-medium text-foreground">Configure</span>. Copy either the numeric
            installation ID or the full URL.
          </p>
        </div>

        <DialogFooter showCloseButton>
          <Button onClick={handleSubmit} disabled={isSubmitting || !parsedInstallationId}>
            {isSubmitting ? "Linking..." : "Link Installation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
