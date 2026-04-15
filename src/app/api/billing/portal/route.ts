import { NextResponse } from "next/server"
import {
  canManageWorkspaceBilling,
  getWorkspaceBillingSummary,
  isPrismaConnectivityError,
} from "@/lib/db"
import { getStripe } from "@/lib/stripe"
import { getAuthenticatedAppContext } from "@/lib/app-context"

export async function POST() {
  const { user, workspace, isPlatformAdmin } = await getAuthenticatedAppContext()
  if (!user || !workspace) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let stripe
  try {
    stripe = getStripe()
  } catch {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 })
  }

  const canManage = await canManageWorkspaceBilling(user.id, workspace.id)
  if (!canManage && !isPlatformAdmin) {
    return NextResponse.json(
      { error: "Only workspace owners can manage workspace billing." },
      { status: 403 }
    )
  }

  let stripeCustomerId: string | null = null
  try {
    const billingWorkspace = await getWorkspaceBillingSummary(workspace.id)
    stripeCustomerId = billingWorkspace?.stripeCustomerId ?? null
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
