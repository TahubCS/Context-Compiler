import { createClient } from "@/utils/supabase/server"
import { getUserSubscriptionTier, isPrismaConnectivityError } from "@/lib/db"
import { CreditCard, Check } from "lucide-react"
import { UpgradeButton } from "@/components/features/billing/upgrade-button"
import { ManageBillingButton } from "@/components/features/billing/manage-billing-button"

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

export default async function BillingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let subscriptionTier: string = "FREE"

  try {
    subscriptionTier = (await getUserSubscriptionTier(user.id)) ?? "FREE"
  } catch (err) {
    if (!isPrismaConnectivityError(err)) throw err
  }

  const currentTier = TIER_DETAILS[subscriptionTier] ?? TIER_DETAILS.FREE
  const isPaid = subscriptionTier !== "FREE"

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">Billing</h1>

      {/* Current plan */}
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Current Plan</h2>
          </div>
          {isPaid && <ManageBillingButton />}
        </div>
        <p className="mt-4 text-2xl font-bold text-foreground">{currentTier.label}</p>
        <p className="mt-1 text-sm text-muted-foreground">{currentTier.description}</p>
      </section>

      {/* Upgrade options */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold text-foreground">Upgrade Plan</h2>
        <div className="flex flex-col gap-4">
          {UPGRADE_TIERS.map((tier) => {
            const isCurrent = subscriptionTier === tier.key
            const isEnterprise = tier.key === "ENTERPRISE"
            return (
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
                <UpgradeButton
                  tier={tier.key}
                  label={isCurrent ? "Current Plan" : isEnterprise ? "Contact Us" : `Upgrade to ${tier.label}`}
                  disabled={isCurrent || isEnterprise}
                />
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
