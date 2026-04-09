import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"

const tiers = [
  {
    name: "Free",
    price: "$0",
    description: "For individual developers getting started.",
    features: ["1 repository", "100 searches / month", "Community support"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$12",
    description: "For developers who need more power.",
    features: [
      "Unlimited repositories",
      "Unlimited searches",
      "Priority support",
      "Advanced context cart",
    ],
    cta: "Upgrade to Pro",
    highlighted: true,
  },
  {
    name: "Team",
    price: "$49",
    description: "For teams collaborating on large codebases.",
    features: [
      "Everything in Pro",
      "Up to 10 seats",
      "Shared context carts",
      "Audit logs",
    ],
    cta: "Upgrade to Team",
    highlighted: false,
  },
]

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-6">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-foreground">Simple pricing</h1>
        <p className="mt-3 text-muted-foreground">
          Start for free. Upgrade when you need more.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`flex flex-col rounded-2xl border p-6 ${
              tier.highlighted
                ? "border-primary bg-card shadow-lg"
                : "border-border bg-card"
            }`}
          >
            <h2 className="text-xl font-bold text-foreground">{tier.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
            <p className="mt-4 text-3xl font-bold text-foreground">
              {tier.price}
              <span className="text-base font-normal text-muted-foreground">/mo</span>
            </p>

            <ul className="mt-6 flex flex-col gap-2">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="size-4 shrink-0 text-primary" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-8">
              <Button
                className="w-full"
                variant={tier.highlighted ? "default" : "outline"}
                disabled
              >
                {tier.cta} — Coming Soon
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Billing powered by Stripe — coming soon.
      </p>
    </div>
  )
}
