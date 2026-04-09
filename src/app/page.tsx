"use client" // This is required for interactivity

import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/client"

export default function Home() {
  const handleLogin = async () => {
    const supabase = createClient()
    
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        // This tells GitHub where to send the user after they click "Authorize"
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-24">
      <div className="flex flex-col items-center gap-6 rounded-xl border bg-card p-10 shadow-lg">
        <h1 className="text-3xl font-bold text-foreground">Context Compiler</h1>
        <Button size="lg" className="w-full" onClick={handleLogin}>
          Log in with GitHub
        </Button>
      </div>
    </main>
  )
}