import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { CreditCard, Check } from "lucide-react"

const TIER_DETAILS: Record<string, { label: string; description: string }> = {
  FREE:       { label: "Free",       description: "1 repository, 100 searches / month." },
  PRO:        { label: "Pro",        description: "Unlimited repositories and searches." },
  TEAM:       { label: "Team",       description: "Everything in Pro plus up to 10 seats." },
  ENTERPRISE: { label: "Enterprise", description: "Custom limits and dedicated support." },
}

const UPGRADE_TIERS = [
  {
    key: "PRO",
    label: "Pro",
    price: "$12 / mo",
    features: ["Unlimited repositories", "Unlimited searches", "Priority support"],
  },
  {
    key: "TEAM",
    label: "Team",
    price: "$49 / mo",
    features: ["Everything in Pro", "Up to 10 seats", "Shared context carts"],
  },
  {
    key: "ENTERPRISE",
    label: "Enterprise",
    price: "Custom",
    features: ["Custom limits", "Dedicated support", "Audit logs"],
  },
]

function isPrismaConnectivityError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes("tenant or user not found") ||
    message.includes("driveradaptererror") ||
    message.includes("can't reach database server") ||
    message.includes("connection")
  )
}

export default async function BillingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let subscriptionTier = "FREE"

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { subscriptionTier: true },
    })
    subscriptionTier = dbUser?.subscriptionTier ?? "FREE"
  } catch (err) {
    if (!isPrismaConnectivityError(err)) throw err
  }

  const currentTier = TIER_DETAILS[subscriptionTier] ?? TIER_DETAILS.FREE

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">Billing</h1>

      {/* Current plan */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Current Plan</h2>
        </div>
        <p className="text-2xl font-bold text-foreground">{currentTier.label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{currentTier.description}</p>
      </section>

      {/* Upgrade options */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold text-foreground">Upgrade Plan</h2>
        <div className="flex flex-col gap-4">
          {UPGRADE_TIERS.map((tier) => (
            <div
              key={tier.key}
              className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{tier.label}</p>
                  <span className="text-sm text-muted-foreground">{tier.price}</span>
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Check className="size-3 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <Button variant="outline" size="sm" disabled className="shrink-0">
                Upgrade — Coming Soon
              </Button>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-sm text-muted-foreground">
        Stripe billing portal integration coming soon.
      </p>
    </div>
  )
}
