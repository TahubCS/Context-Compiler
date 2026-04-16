import { NextResponse } from "next/server"
import {
  completeUserRepoTour,
  getUserOnboardingState,
  isPrismaConnectivityError,
  markUserOnboardingSeen,
  skipUserOnboarding,
} from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

type OnboardingAction = "get" | "mark-seen" | "skip" | "complete-repo-tour"

export async function GET() {
  const { user } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const state = await getUserOnboardingState(user.id)
    return NextResponse.json({ state })
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }
}

export async function PATCH(req: Request) {
  const { user } = await getAuthenticatedAppContext()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { action?: OnboardingAction }
  try {
    body = (await req.json()) as { action?: OnboardingAction }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const action = body.action
  if (!action || action === "get") {
    return NextResponse.json({ error: "action is required" }, { status: 400 })
  }

  try {
    const state =
      action === "mark-seen"
        ? await markUserOnboardingSeen(user.id)
        : action === "skip"
          ? await skipUserOnboarding(user.id)
          : await completeUserRepoTour(user.id)

    return NextResponse.json({ state })
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }
}
