"use client"

import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowRight,
  CircleHelp,
  Compass,
  Search,
  ShoppingCart,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
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

type RepoHelpCenterProps = {
  autoStartTour: boolean
}

type TourStep = {
  selector: string
  eyebrow: string
  title: string
  description: string
}

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-tour="ask-workflow"]',
    eyebrow: "Ask",
    title: "Start with the repo-level brief",
    description:
      "Use Ask when you want architecture, flows, and broad understanding before chasing exact code snippets.",
  },
  {
    selector: '[data-tour="search-tab"]',
    eyebrow: "Search",
    title: "Search for exact evidence after you understand the bigger picture",
    description:
      "Use Search for symbols, implementation details, and likely declaration sites. Results are best-matching chunks, not guaranteed definitions.",
  },
  {
    selector: '[data-tour="context-cart"]',
    eyebrow: "Cart",
    title: "Assemble a smaller, cleaner context pack",
    description:
      "The Context Cart is where you keep only the evidence your agent actually needs, instead of dumping whole files into chat.",
  },
  {
    selector: '[data-tour="scan-button"]',
    eyebrow: "Scan",
    title: "Refresh the repo when context is stale",
    description:
      "If the repo changed, trigger a scan so new files and updated chunks are available to Ask, Search, and the Cart.",
  },
  {
    selector: '[data-tour="help-entry"]',
    eyebrow: "Help",
    title: "Reopen this help any time",
    description:
      "Use How this works? whenever you want a quick reminder, FAQ answers, or to replay the guided walkthrough.",
  },
]

const FAQ_ITEMS = [
  {
    value: "best-for",
    question: "What is this app best for?",
    answer:
      "Context Compiler is best for understanding a codebase faster, asking grounded repository questions, finding exact supporting snippets, and exporting focused context to your agent.",
  },
  {
    value: "ask",
    question: "What can Ask do well?",
    answer:
      "Ask is strongest when you want repo-level understanding: architecture, workflows, responsibilities, blast radius, and where to investigate next.",
  },
  {
    value: "search-vs-ask",
    question: "When should I use Search instead of Ask?",
    answer:
      "Use Search when you already know roughly what you need and want exact code evidence like a symbol, helper, implementation detail, or a likely declaration site.",
  },
  {
    value: "declaration-sites",
    question: "Why aren’t search results always the exact declaration site?",
    answer:
      "Search is semantic chunk retrieval. It returns the most relevant indexed chunks, which often helps more than a strict text match, but it does not guarantee the exact definition block.",
  },
  {
    value: "cart",
    question: "What does the Context Cart do?",
    answer:
      "The cart lets you curate only the code snippets and citations you want to hand to an agent. It is a review workspace, not just a clipboard bucket.",
  },
  {
    value: "full-context",
    question: "Can this app give my agent the entire codebase context automatically?",
    answer:
      "No. The app helps retrieve the right slice of context for a task. It improves grounding, but it does not create perfect full-repo understanding automatically.",
  },
  {
    value: "outdated",
    question: "What should I do if the repo is outdated or not scanned yet?",
    answer:
      "Run a scan or re-scan first. Retrieval quality depends on the indexed code being current enough for the question you are asking.",
  },
]

export function RepoHelpCenter({ autoStartTour }: RepoHelpCenterProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [helpOpen, setHelpOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(autoStartTour)
  const [stepIndex, setStepIndex] = useState(0)
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const currentStep = TOUR_STEPS[stepIndex]

  useEffect(() => {
    if (!tourOpen || !currentStep) return

    const updateRect = () => {
      const element = document.querySelector(currentStep.selector)
      if (!(element instanceof HTMLElement)) {
        setTargetRect(null)
        return
      }

      setTargetRect(element.getBoundingClientRect())
    }

    updateRect()
    window.addEventListener("resize", updateRect)
    window.addEventListener("scroll", updateRect, true)

    return () => {
      window.removeEventListener("resize", updateRect)
      window.removeEventListener("scroll", updateRect, true)
    }
  }, [currentStep, tourOpen])

  const coachmarkPosition = useMemo(() => {
    if (!targetRect || typeof window === "undefined") return null

    const cardWidth = 360
    const horizontalPadding = 24
    const left = Math.min(
      window.innerWidth - cardWidth - horizontalPadding,
      Math.max(horizontalPadding, targetRect.left)
    )
    const spaceBelow = window.innerHeight - targetRect.bottom
    const top = spaceBelow > 260 ? targetRect.bottom + 16 : Math.max(24, targetRect.top - 220)

    return { top, left }
  }, [targetRect])

  function removeTourQuery() {
    if (!searchParams?.get("tour")) return

    const params = new URLSearchParams(searchParams.toString())
    params.delete("tour")
    const next = params.toString()
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false })
  }

  async function persistTourComplete() {
    const res = await fetch("/api/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete-repo-tour" }),
    })

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      throw new Error(data?.error ?? "Could not save onboarding progress.")
    }
  }

  async function handleCloseTour() {
    try {
      await persistTourComplete()
      setTourOpen(false)
      removeTourQuery()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not close the walkthrough.")
    }
  }

  function handleReplayTour() {
    setHelpOpen(false)
    setStepIndex(0)
    setTourOpen(true)
  }

  return (
    <>
      <div data-tour="help-entry">
        <Button size="sm" variant="outline" onClick={() => setHelpOpen(true)}>
          <CircleHelp className="size-4" />
          How this works?
        </Button>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-3xl rounded-4xl border-border bg-card/95 backdrop-blur-2xl">
          <DialogHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Repo help</Badge>
              <Badge variant="outline">Workflow + FAQ</Badge>
            </div>
            <DialogTitle className="text-2xl leading-tight">
              Use Ask, Search, and the Cart deliberately
            </DialogTitle>
            <DialogDescription className="text-sm leading-7 text-muted-foreground">
              Context Compiler shines when you start broad, inspect evidence, and then export only
              the right slice of code context to your agent.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-3">
            <HelpPillar
              icon={<Sparkles className="size-4 text-muted-foreground" />}
              title="Ask"
              description="Use Ask first when you want architecture, use cases, responsibilities, or a fast read on the shape of the repo."
            />
            <HelpPillar
              icon={<Search className="size-4 text-muted-foreground" />}
              title="Search"
              description="Use Search when you need exact supporting evidence like a function, helper, or the most relevant chunks around a specific change."
            />
            <HelpPillar
              icon={<ShoppingCart className="size-4 text-muted-foreground" />}
              title="Context Cart"
              description="Review the snippets you actually want to send to an agent so the final prompt pack stays grounded and intentional."
            />
          </div>

          <div className="rounded-3xl border border-border bg-background/60 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Compass className="size-4 text-muted-foreground" />
              <h3 className="font-medium text-foreground">Frequently asked questions</h3>
            </div>
            <Accordion type="single" collapsible className="border-border bg-transparent">
              {FAQ_ITEMS.map((item) => (
                <AccordionItem key={item.value} value={item.value}>
                  <AccordionTrigger>{item.question}</AccordionTrigger>
                  <AccordionContent>{item.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <DialogFooter className="justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Replay the guided walkthrough whenever you want a visual reminder.
            </p>
            <Button onClick={handleReplayTour}>
              <WandSparkles className="size-4" />
              Replay guided tour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {tourOpen && currentStep && targetRect && coachmarkPosition ? (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-background/75 backdrop-blur-sm" />
          <div
            className="pointer-events-none absolute rounded-3xl ring-2 ring-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-all"
            style={{
              top: targetRect.top - 8,
              left: targetRect.left - 8,
              width: targetRect.width + 16,
              height: targetRect.height + 16,
            }}
          />
          <div
            className="absolute w-88 rounded-4xl border border-border bg-card/95 p-5 shadow-2xl backdrop-blur-2xl"
            style={coachmarkPosition}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{currentStep.eyebrow}</Badge>
                <Badge variant="outline">
                  {stepIndex + 1} / {TOUR_STEPS.length}
                </Badge>
              </div>
              <Button size="icon-xs" variant="ghost" onClick={handleCloseTour}>
                <X className="size-3.5" />
              </Button>
            </div>
            <h3 className="text-lg font-semibold text-foreground">{currentStep.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {currentStep.description}
            </p>
            <div className="mt-5 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                disabled={stepIndex === 0}
              >
                Back
              </Button>
              {stepIndex === TOUR_STEPS.length - 1 ? (
                <Button size="sm" onClick={handleCloseTour}>
                  Finish walkthrough
                </Button>
              ) : (
                <Button size="sm" onClick={() => setStepIndex((current) => current + 1)}>
                  <ArrowRight className="size-4" />
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function HelpPillar({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="rounded-3xl border border-border bg-background/60 p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="font-medium text-foreground">{title}</h3>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}
