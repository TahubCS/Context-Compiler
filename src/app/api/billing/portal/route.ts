import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { isPrismaConnectivityError, prisma } from "@/lib/db"
import { getStripe } from "@/lib/stripe"

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let stripe
  try {
    stripe = getStripe()
  } catch {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 })
  }

  let stripeCustomerId: string | null = null
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { stripeCustomerId: true },
    })
    stripeCustomerId = dbUser?.stripeCustomerId ?? null
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }

  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: "No active subscription found." },
      { status: 400 }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"

  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${appUrl}/settings/billing`,
  })

  return NextResponse.json({ url: session.url })
}
