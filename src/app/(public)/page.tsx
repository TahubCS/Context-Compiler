"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createClient } from "@/utils/supabase/client"
import {
  Search,
  MessageSquare,
  ShoppingCart,
  Zap,
  GitBranch,
  Users,
  ArrowRight,
} from "lucide-react"

const features = [
  {
    icon: Search,
    title: "Natural Language Search",
    description:
      "Find any function, pattern, or concept in your codebase with plain English. No regex, no grep — just ask.",
  },
  {
    icon: MessageSquare,
    title: "Repository Q&A",
    description:
      "Ask questions about your codebase and get AI-generated answers grounded in actual code, with source citations.",
  },
  {
    icon: ShoppingCart,
    title: "Context Cart",
    description:
      "Collect relevant code snippets into a Context Cart and export the whole set as a token-optimized prompt for any AI assistant.",
  },
  {
    icon: Zap,
    title: "Incremental Re-indexing",
    description:
      "Only changed files are re-embedded on re-scan. Unchanged chunks reuse cached vectors — fast updates without full re-indexing.",
  },
  {
    icon: GitBranch,
    title: "GitHub App Sync",
    description:
      "Webhook-driven repository inventory with automatic reconciliation. No polling, no manual imports.",
  },
  {
    icon: Users,
    title: "Team Workspaces",
    description:
      "Share saved context carts and answer sessions across your team. Role-based access for owners, admins, and members.",
  },
]

const steps = [
  {
    number: "01",
    title: "Connect your repositories",
    description:
      "Sign in with GitHub and install the Context Compiler App. Your repository inventory syncs automatically via webhooks.",
  },
  {
    number: "02",
    title: "Scan and index",
    description:
      "Trigger a scan and the AI microservice clones, chunks, and embeds your codebase into a pgvector HNSW index.",
  },
  {
    number: "03",
    title: "Search, ask, and build context",
    description:
      "Use natural language search or repo Q&A to find what you need, then collect it in the Context Cart for your AI coding session.",
  },
]

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

      if (error) throw error
      if (!data.url) throw new Error("GitHub sign-in URL was not returned by Supabase.")

      window.location.assign(data.url)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start GitHub sign-in."
      setAuthError(message)
      setIsSigningIn(false)
    }
  }

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 pb-20 pt-20 text-center md:px-6 md:pt-28">
        <div className="rounded-4xl border border-border bg-muted px-4 py-1.5 text-sm text-muted-foreground">
          RAG-powered codebase search for AI coding assistants
        </div>
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl">
          Stop guessing which files
          <br />
          <span className="text-primary">to paste into your AI.</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Context Compiler indexes your GitHub repositories into a semantic vector store. Search
          with natural language, ask questions about your code, and assemble precise context
          snippets for Claude, Cursor, or any AI assistant.
        </p>
        <div className="flex flex-col items-center gap-3">
          <Button size="lg" className="min-w-48" onClick={handleLogin} disabled={isSigningIn}>
            {isSigningIn ? "Redirecting to GitHub..." : "Get started free"}
            {!isSigningIn && <ArrowRight className="ml-2 size-4" />}
          </Button>
          <Link
            href="/pricing"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            View pricing →
          </Link>
        </div>
        {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-20 md:px-6">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold text-foreground">
            Everything you need to give AI the right context
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
              >
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="size-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto w-full max-w-5xl px-4 py-16 md:px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold text-foreground">How it works</h2>
          </div>
          <div className="grid grid-cols-1 gap-10 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="flex flex-col gap-3">
                <span className="text-4xl font-bold text-primary">{step.number}</span>
                <h3 className="font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing CTA */}
      <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center md:px-6">
        <h2 className="text-2xl font-bold text-foreground">
          Start for free. No credit card required.
        </h2>
        <p className="mt-3 text-muted-foreground">
          Index one repository and run 100 searches per month at no cost. Upgrade when you need
          more.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={handleLogin} disabled={isSigningIn}>
            {isSigningIn ? "Redirecting..." : "Get started free"}
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/pricing">See all plans</Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
