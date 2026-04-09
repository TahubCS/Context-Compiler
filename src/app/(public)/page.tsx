"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/client"

export default function Home() {
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const handleLogin = async () => {
    try {
      setIsSigningIn(true)
      setAuthError(null)

      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: true,
        },
      })

      if (error) {
        throw error
      }

      if (!data.url) {
        throw new Error("GitHub sign-in URL was not returned by Supabase.")
      }

      window.location.assign(data.url)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start GitHub sign-in."
      setAuthError(message)
      setIsSigningIn(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-24">
      <div className="flex flex-col items-center gap-6 rounded-xl border border-border bg-card p-10 shadow-lg">
        <h1 className="text-3xl font-bold text-foreground">Context Compiler</h1>
        <p className="text-center text-muted-foreground">
          AI-powered code context manager. Search your repositories with natural language.
        </p>
        <Button size="lg" className="w-full" onClick={handleLogin} disabled={isSigningIn}>
          {isSigningIn ? "Redirecting to GitHub..." : "Log in with GitHub"}
        </Button>
        {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
      </div>
    </div>
  )
}
