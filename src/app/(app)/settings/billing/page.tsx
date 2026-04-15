import { getWorkspaceBillingSummary } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { CreditCard, Check } from "lucide-react"
import { UpgradeButton } from "@/components/features/billing/upgrade-button"
import { ManageBillingButton } from "@/components/features/billing/manage-billing-button"

const TIER_DETAILS: Record<string, { label: string; description: string }> = {
  FREE: { label: "Free", description: "Solo workspace with core repository tooling." },
  PRO: { label: "Pro", description: "Premium personal workspace features." },
  TEAM: { label: "Team", description: "Shared collaboration with up to 10 seats." },
  ENTERPRISE: {
    label: "Enterprise",
    description: "Expanded seat limits and enterprise-ready collaboration.",
  },
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
    features: ["Shared workspaces", "Up to 10 seats", "Shared carts and answers"],
  },
  {
    key: "ENTERPRISE",
    label: "Enterprise",
    price: "Custom",
    features: ["Custom limits", "Dedicated support", "Audit oversight"],
  },
]

export default async function BillingPage() {
  const { workspace } = await getAuthenticatedAppContext()
  if (!workspace) return null

  const billingWorkspace = await getWorkspaceBillingSummary(workspace.id)
  const subscriptionTier = billingWorkspace?.subscriptionTier ?? "FREE"
  const currentTier = TIER_DETAILS[subscriptionTier] ?? TIER_DETAILS.FREE
  const isPaid = subscriptionTier !== "FREE"

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-bold text-foreground">Workspace Billing</h1>

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
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
            <p className="mt-0.5 text-sm text-foreground">{workspace.name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Members</p>
            <p className="mt-0.5 text-sm text-foreground">
              {billingWorkspace?._count.members ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Seat Limit</p>
            <p className="mt-0.5 text-sm text-foreground">
              {billingWorkspace?.seatLimit ?? "Unlimited / n/a"}
            </p>
          </div>
        </div>
      </section>

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
                    {tier.features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground"
                      >
                        <Check className="size-3 shrink-0 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
                <UpgradeButton
                  tier={tier.key}
                  label={
                    isCurrent
                      ? "Current Plan"
                      : isEnterprise
                        ? "Contact Us"
                        : `Upgrade to ${tier.label}`
                  }
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
