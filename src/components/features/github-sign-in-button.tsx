"use client"

import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getOAuthCallbackUrl } from "@/lib/auth-urls"
import { createClient } from "@/utils/supabase/client"

export function GitHubSignInButton({
  label = "Sign in with GitHub",
  nextPath,
  showArrow = false,
  size,
  className,
}: {
  label?: string
  nextPath?: string
  showArrow?: boolean
  size?: "default" | "sm" | "lg"
  className?: string
}) {
  const [isRedirecting, setIsRedirecting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function startOAuth() {
    setIsRedirecting(true)
    setErrorMessage(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: getOAuthCallbackUrl(window.location.origin, nextPath),
          skipBrowserRedirect: true,
        },
      })
      if (error) throw error
      if (!data.url) throw new Error("The authentication service did not return a GitHub authorization URL.")
      window.location.assign(data.url)
    } catch (error) {
      console.error("Unable to start GitHub OAuth", error)
      setErrorMessage("GitHub sign-in could not start. Check the deployment's Supabase configuration and try again.")
      setIsRedirecting(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button onClick={startOAuth} disabled={isRedirecting} size={size} className={className}>
        {isRedirecting ? "Redirecting to GitHub..." : label}
        {!isRedirecting && showArrow ? <ArrowRight className="ml-2 size-4" /> : null}
      </Button>
      {errorMessage ? <p role="alert" className="max-w-sm text-sm text-destructive">{errorMessage}</p> : null}
    </div>
  )
}
