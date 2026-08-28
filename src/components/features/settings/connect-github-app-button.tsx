"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

type ConnectGitHubAppButtonProps = {
  workspaceId: string
}

export function ConnectGitHubAppButton({ workspaceId }: ConnectGitHubAppButtonProps) {
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <Button
        onClick={() => {
          setIsRedirecting(true)
          setErrorMessage(null)
          try {
            window.location.assign(`/api/github-app/install?workspaceId=${encodeURIComponent(workspaceId)}`)
          } catch {
            setIsRedirecting(false)
            setErrorMessage("Could not open the GitHub App installation page. Please try again.")
          }
        }}
        disabled={isRedirecting}
      >
        {isRedirecting ? "Redirecting..." : "Connect GitHub App"}
      </Button>
      {errorMessage ? <p role="alert" className="text-sm text-destructive">{errorMessage}</p> : null}
    </div>
  )
}
