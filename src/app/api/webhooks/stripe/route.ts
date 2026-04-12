import { NextResponse } from "next/server"
import type Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { prisma } from "@/lib/db"
import { SubscriptionTier } from "@prisma/client"

const TIER_MAP: Record<string, SubscriptionTier> = {
  PRO: SubscriptionTier.PRO,
  TEAM: SubscriptionTier.TEAM,
  ENTERPRISE: SubscriptionTier.ENTERPRISE,
}

async function syncSubscription(
  userId: string,
  stripeCustomerId: string,
  tier: SubscriptionTier
) {
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId, subscriptionTier: tier },
  })
}

export async function POST(request: Request) {
  const sig = request.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!sig || !webhookSecret) {
    return NextResponse.json({ error: "Missing signature or secret." }, { status: 400 })
  }

  let stripe
  try {
    stripe = getStripe()
  } catch {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 503 })
  }

  const body = await request.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.userId
        const tier = session.metadata?.tier

        if (!userId || !tier || !TIER_MAP[tier]) break
        if (!session.customer) break

        await syncSubscription(
          userId,
          session.customer as string,
          TIER_MAP[tier]
        )
        break
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.userId
        const tier = sub.metadata?.tier

        if (!userId || !tier || !TIER_MAP[tier]) break

        await syncSubscription(userId, sub.customer as string, TIER_MAP[tier])
        break
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.userId

        if (!userId) break

        await prisma.user.update({
          where: { id: userId },
          data: { subscriptionTier: SubscriptionTier.FREE },
        })
        break
      }
    }
  } catch (err) {
    console.error("Stripe webhook handler error:", err)
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
