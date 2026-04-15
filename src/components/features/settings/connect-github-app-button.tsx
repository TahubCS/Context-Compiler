"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"

type ConnectGitHubAppButtonProps = {
  workspaceId: string
}

export function ConnectGitHubAppButton({ workspaceId }: ConnectGitHubAppButtonProps) {
  const [isRedirecting, setIsRedirecting] = useState(false)

  return (
    <Button
      onClick={() => {
        setIsRedirecting(true)
        window.location.assign(`/api/github-app/install?workspaceId=${workspaceId}`)
      }}
      disabled={isRedirecting}
    >
      {isRedirecting ? "Redirecting..." : "Connect GitHub App"}
    </Button>
  )
}
