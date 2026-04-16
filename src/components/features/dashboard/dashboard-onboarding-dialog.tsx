"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CheckCircle2, Compass, GitBranch, Sparkles } from "lucide-react"
import { ConnectGitHubAppButton } from "@/components/features/settings/connect-github-app-button"
import { SyncRepositoriesButton } from "@/components/features/repositories/sync-repositories-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"

type DashboardOnboardingDialogProps = {
  shouldAutoOpen: boolean
  hasGitHubApp: boolean
  firstRepositoryId: string | null
  workspaceId: string
  canManageGitHubApp: boolean
}

export function DashboardOnboardingDialog({
  shouldAutoOpen,
  hasGitHubApp,
  firstRepositoryId,
  workspaceId,
  canManageGitHubApp,
}: DashboardOnboardingDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(shouldAutoOpen)
  const [isSaving, setIsSaving] = useState(false)

  const readiness = useMemo(() => {
    if (!hasGitHubApp) {
      return {
        title: "Connect the GitHub App first",
        description:
          "Context Compiler works best when the workspace GitHub App is connected, because repository sync and scans then stay grounded in the actual installation.",
      }
    }

    if (!firstRepositoryId) {
      return {
        title: "Sync repositories before the repo tour",
        description:
          "The guided walkthrough uses one of your real repositories, so pull repository inventory into the workspace before starting the tour.",
      }
    }

    return {
      title: "You’re ready for the repo walkthrough",
      description:
        "We’ll open one real repository and show you how Ask, Search, and the Context Cart help you and your agent work with grounded code context.",
    }
  }, [firstRepositoryId, hasGitHubApp])

  async function persistAction(action: "mark-seen" | "skip" | "complete-repo-tour") {
    const res = await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    })

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(data?.error ?? "Could not update onboarding state.")
    }
  }

  async function handleSkip() {
    try {
      setIsSaving(true)
      await persistAction("skip")
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not skip onboarding.")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleStartTour() {
    if (!hasGitHubApp || !firstRepositoryId) return

    try {
      setIsSaving(true)
      await persistAction("mark-seen")
      setOpen(false)
      router.push(`/repo/${firstRepositoryId}?tour=1`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start the tour.")
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? void handleSkip() : setOpen(nextOpen))}>
      <DialogContent
        showCloseButton={false}
        className="max-w-4xl rounded-4xl border-border bg-card/95 backdrop-blur-2xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Welcome to Context Compiler</Badge>
            <Badge variant="outline">First-time setup</Badge>
          </div>
          <DialogTitle className="text-2xl leading-tight">
            Understand the repo faster, then hand your agent better context
          </DialogTitle>
          <DialogDescription className="max-w-3xl text-sm leading-7 text-muted-foreground">
            Context Compiler helps you search a codebase, ask grounded questions about its
            architecture, and export focused context packs for an AI agent. It does not magically
            give complete knowledge of the whole repository, and it does not replace engineering
            judgment.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-border bg-background/60 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="size-4 text-muted-foreground" />
              <h3 className="font-medium text-foreground">What it does well today</h3>
            </div>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-primary" />
                Ask repository-level questions to get grounded architecture and workflow briefs.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-primary" />
                Search for exact code evidence, symbols, or implementation snippets.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-primary" />
                Build smaller context packs so your agent gets the right slice instead of random
                file dumps.
              </li>
            </ul>
          </div>

          <div className="rounded-3xl border border-border bg-background/60 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Compass className="size-4 text-muted-foreground" />
              <h3 className="font-medium text-foreground">What it cannot do for you</h3>
            </div>
            <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
              <li className="flex gap-2">
                <GitBranch className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                It is not a full “understand the entire codebase automatically” system.
              </li>
              <li className="flex gap-2">
                <GitBranch className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                Search results are best-matching chunks, not guaranteed declaration sites.
              </li>
              <li className="flex gap-2">
                <GitBranch className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
                The value comes from inspecting the answer and evidence, then exporting what you
                actually want your agent to see.
              </li>
            </ul>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-background/60 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Next step</Badge>
            <h3 className="font-medium text-foreground">{readiness.title}</h3>
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{readiness.description}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {!hasGitHubApp && canManageGitHubApp ? (
              <ConnectGitHubAppButton workspaceId={workspaceId} />
            ) : null}
            {!hasGitHubApp && !canManageGitHubApp ? (
              <p className="text-sm text-muted-foreground">
                Ask a workspace owner or admin to connect the GitHub App before the guided repo
                walkthrough can start.
              </p>
            ) : null}
            {hasGitHubApp && !firstRepositoryId ? <SyncRepositoriesButton label="Sync repositories" /> : null}
            {hasGitHubApp && firstRepositoryId ? (
              <Button onClick={handleStartTour} disabled={isSaving}>
                <ArrowRight className="size-4" />
                Start repo tour
              </Button>
            ) : null}
          </div>
        </div>

        <DialogFooter className="justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            You can skip now and reopen the walkthrough later from the repo page.
          </p>
          <Button variant="ghost" onClick={handleSkip} disabled={isSaving}>
            Skip for now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
