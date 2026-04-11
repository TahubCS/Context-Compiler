"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

const reasonLabelMap: Record<string, string> = {
  missing_code: "GitHub did not return an authorization code.",
  exchange_failed: "We could not exchange the authorization code for a session.",
  missing_email: "Your GitHub account did not provide an email for authentication.",
}

function AuthCodeErrorContent() {
  const searchParams = useSearchParams()
  const reason = searchParams.get("reason") ?? "unknown"
  const message = reasonLabelMap[reason] ?? "Authentication failed due to an unknown issue."

  return (
    <>
      <p className="mt-3 text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Back to Login
        </Link>
        <Link
          href="/"
          className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
        >
          Try Again
        </Link>
      </div>
    </>
  )
}

export default function AuthCodeErrorPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold text-foreground">Authentication Error</h1>
        <Suspense fallback={<p className="mt-3 text-sm text-muted-foreground">Loading...</p>}>
          <AuthCodeErrorContent />
        </Suspense>
      </section>
    </main>
  )
}
