"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Briefcase, Loader2, Users } from "lucide-react"
import { toast } from "sonner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type WorkspaceOption = {
  id: string
  name: string
  type: "PERSONAL" | "TEAM"
  subscriptionTier: string
  role: string
  accessMode: "membership" | "platform_admin"
}

type WorkspaceSwitcherProps = {
  activeWorkspaceId: string | null
  workspaces: WorkspaceOption[]
}

export function WorkspaceSwitcher({
  activeWorkspaceId,
  workspaces,
}: WorkspaceSwitcherProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleChange(workspaceId: string) {
    setIsSubmitting(true)
    try {
      const res = await fetch("/api/workspaces/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      })

      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Could not switch workspace.")
        return
      }

      router.refresh()
    } catch {
      toast.error("Could not switch workspace.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Select value={activeWorkspaceId ?? undefined} onValueChange={handleChange} disabled={isSubmitting}>
      <SelectTrigger className="min-w-52 max-w-72">
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
        <SelectValue placeholder="Select workspace" />
      </SelectTrigger>
      <SelectContent>
        {workspaces.map((workspace) => (
          <SelectItem key={workspace.id} value={workspace.id}>
            <div className="flex items-center gap-2">
              {workspace.type === "PERSONAL" ? (
                <Briefcase className="size-4 text-muted-foreground" />
              ) : (
                <Users className="size-4 text-muted-foreground" />
              )}
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate">{workspace.name}</span>
                {workspace.accessMode === "platform_admin" ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    Admin view only
                  </span>
                ) : null}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
