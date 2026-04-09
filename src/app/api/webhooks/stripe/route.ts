import { NextResponse } from "next/server"

export async function POST(request: Request) {
  // TODO: Verify Stripe webhook signature
  // const sig = request.headers.get("stripe-signature")
  // const body = await request.text()
  // const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  //
  // Handle events:
  //   checkout.session.completed   → provision subscription
  //   customer.subscription.updated → update subscriptionTier in Prisma
  //   customer.subscription.deleted → downgrade to FREE in Prisma

  return NextResponse.json({ received: true })
}
