import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { isPrismaConnectivityError, prisma } from "@/lib/db"
import { getStripe, PRICE_IDS, type BillingTier } from "@/lib/stripe"

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { tier?: string }
  try {
    body = (await req.json()) as { tier?: string }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const tier = body.tier as BillingTier
  if (!tier || !PRICE_IDS[tier]) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 })
  }

  const priceId = PRICE_IDS[tier]
  if (!priceId) {
    return NextResponse.json(
      { error: `Price ID for ${tier} is not configured.` },
      { status: 503 }
    )
  }

  let stripe
  try {
    stripe = getStripe()
  } catch {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 })
  }

  let currentTier: string | null = null
  let stripeCustomerId: string | null = null

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { subscriptionTier: true, stripeCustomerId: true },
    })
    currentTier = dbUser?.subscriptionTier ?? "FREE"
    stripeCustomerId = dbUser?.stripeCustomerId ?? null
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }

  if (currentTier === tier) {
    return NextResponse.json({ error: "Already on this plan." }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    customer: stripeCustomerId ?? undefined,
    customer_email: stripeCustomerId ? undefined : user.email ?? undefined,
    success_url: `${appUrl}/settings/billing?success=1`,
    cancel_url: `${appUrl}/settings/billing`,
    metadata: { userId: user.id, tier },
    subscription_data: { metadata: { userId: user.id, tier } },
  })

  return NextResponse.json({ url: session.url })
}
