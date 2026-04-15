"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type MemberRoleControlsProps = {
  workspaceId: string
  memberUserId: string
  currentRole: "OWNER" | "ADMIN" | "MEMBER"
  disabled?: boolean
}

export function MemberRoleControls({
  workspaceId,
  memberUserId,
  currentRole,
  disabled = false,
}: MemberRoleControlsProps) {
  const router = useRouter()
  const [role, setRole] = useState(currentRole)
  const [isSaving, setIsSaving] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  async function updateRole(nextRole: string) {
    setRole(nextRole as typeof role)
    setIsSaving(true)
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members/${memberUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        toast.error(data.error ?? "Could not update role.")
        setRole(currentRole)
        return
      }
      toast.success("Workspace role updated.")
      router.refresh()
    } catch {
      toast.error("Could not reach the server.")
      setRole(currentRole)
    } finally {
      setIsSaving(false)
    }
  }

  async function removeMember() {
    setIsRemoving(true)
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members/${memberUserId}`, {
        method: "DELETE",
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        toast.error(data.error ?? "Could not remove member.")
        return
      }
      toast.success("Member removed.")
      router.refresh()
    } catch {
      toast.error("Could not reach the server.")
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={updateRole} disabled={disabled || isSaving || isRemoving}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="MEMBER">Member</SelectItem>
          <SelectItem value="ADMIN">Admin</SelectItem>
          {currentRole === "OWNER" ? <SelectItem value="OWNER">Owner</SelectItem> : null}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={removeMember}
        disabled={disabled || isSaving || isRemoving || currentRole === "OWNER"}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}
