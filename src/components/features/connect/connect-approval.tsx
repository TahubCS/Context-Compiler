"use client"

import { useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type PendingRequest = {
  userCode: string
  clientName: string
  keyPrefix: string
  createdAt: string
}

export function ConnectApproval({
  initialCode,
  workspaceName,
  request,
  codeWasInvalid,
}: {
  initialCode: string
  workspaceName: string
  request: PendingRequest | null
  codeWasInvalid: boolean
}) {
  const router = useRouter()
  const [code, setCode] = useState(initialCode)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [outcome, setOutcome] = useState<"approved" | "denied" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(decision: "approve" | "deny") {
    if (!request) return
    setIsSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/cli/auth/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: request.userCode, decision }),
      })
      const data = (await response.json()) as { status?: "approved" | "denied"; error?: string }
      if (!response.ok || !data.status) {
        setError(data.error ?? "Could not record your decision.")
        return
      }
      setOutcome(data.status)
    } catch {
      setError("Could not reach the server.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (outcome) {
    return (
      <div className="space-y-3 text-center">
        {outcome === "approved" ? (
          <CheckCircle2 className="mx-auto size-8 text-primary" />
        ) : (
          <XCircle className="mx-auto size-8 text-muted-foreground" />
        )}
        <p className="font-medium text-foreground">
          {outcome === "approved" ? "Connected. Return to your terminal." : "Request denied."}
        </p>
        <p className="text-sm leading-7 text-muted-foreground">
          {outcome === "approved"
            ? `The CLI now has a workspace key for ${workspaceName}. You can revoke it from any repository's Use With Agent dialog.`
            : "The terminal's key was not activated. You can close this page."}
        </p>
      </div>
    )
  }

  if (!request) {
    return (
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          router.push(`/connect?code=${encodeURIComponent(code.trim())}`)
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="connect-code">Code shown in your terminal</Label>
          <Input
            id="connect-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="ABCD-EFGH"
            autoComplete="off"
            className="font-mono uppercase"
          />
          {codeWasInvalid ? (
            <p role="alert" className="text-sm text-destructive">
              That code is invalid or has expired. Run connect again for a new one.
            </p>
          ) : null}
        </div>
        <Button type="submit" className="w-full" disabled={!code.trim()}>
          Continue
        </Button>
      </form>
    )
  }

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Code</dt>
        <dd className="font-mono font-medium text-foreground">{request.userCode}</dd>
        <dt className="text-muted-foreground">Device</dt>
        <dd className="text-foreground">{request.clientName}</dd>
        <dt className="text-muted-foreground">Workspace</dt>
        <dd className="text-foreground">{workspaceName}</dd>
        <dt className="text-muted-foreground">Key</dt>
        <dd className="font-mono text-foreground">{request.keyPrefix}…</dd>
      </dl>
      <p className="text-sm leading-7 text-muted-foreground">
        Only approve if this code matches your terminal and you started it in the last few minutes.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-3">
        <Button className="flex-1" disabled={isSubmitting} onClick={() => void decide("approve")}>
          Approve
        </Button>
        <Button variant="outline" className="flex-1" disabled={isSubmitting} onClick={() => void decide("deny")}>
          Deny
        </Button>
      </div>
    </div>
  )
}
