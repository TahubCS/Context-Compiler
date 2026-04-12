import Stripe from "stripe"

export const PRICE_IDS = {
  PRO: process.env.STRIPE_PRO_PRICE_ID ?? "",
  TEAM: process.env.STRIPE_TEAM_PRICE_ID ?? "",
} as const

export type BillingTier = keyof typeof PRICE_IDS

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable.")
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-03-31.basil",
  })
}
