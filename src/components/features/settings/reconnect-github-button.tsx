"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/client"

type ReconnectGitHubButtonProps = {
  redirectPath?: string
}

export function ReconnectGitHubButton({
  redirectPath = "/settings",
}: ReconnectGitHubButtonProps) {
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleReconnect() {
    try {
      setIsRedirecting(true)
      setErrorMessage(null)

      const supabase = createClient()
      const redirectUrl = new URL("/auth/callback", window.location.origin)
      redirectUrl.searchParams.set("next", redirectPath)

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: redirectUrl.toString(),
          skipBrowserRedirect: true,
        },
      })

      if (error) {
        throw error
      }

      if (!data.url) {
        throw new Error("GitHub reconnect URL was not returned by Supabase.")
      }

      window.location.assign(data.url)
    } catch (error) {
      setIsRedirecting(false)
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to start GitHub reconnect."
      )
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleReconnect} disabled={isRedirecting}>
        {isRedirecting ? "Redirecting to GitHub..." : "Reconnect GitHub"}
      </Button>
      {errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}
    </div>
  )
}
