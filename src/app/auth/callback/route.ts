import { prisma } from "@/lib/prisma"
import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

let isPrismaUserSyncDisabled = false

function isPrismaConnectivityError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()

  return (
    message.includes("tenant or user not found") ||
    message.includes("driveradaptererror") ||
    message.includes("can't reach database server") ||
    message.includes("connection")
  )
}

function getSafeRedirect(origin: string, nextPath: string | null) {
  if (!nextPath || !nextPath.startsWith("/")) {
    return `${origin}/dashboard`
  }

  return `${origin}${nextPath}`
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const nextPath = requestUrl.searchParams.get("next")
  const redirectTarget = getSafeRedirect(requestUrl.origin, nextPath)

  if (!code) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?reason=missing_code`
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.user) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?reason=exchange_failed`
    )
  }

  const user = data.user

  if (!user.email) {
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?reason=missing_email`
    )
  }

  const githubId = user.user_metadata.provider_id?.toString() ?? null

  if (!isPrismaUserSyncDisabled) {
    try {
      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          email: user.email,
          githubId,
          name: user.user_metadata.full_name ?? user.user_metadata.user_name ?? null,
          avatarUrl: user.user_metadata.avatar_url ?? null,
        },
        create: {
          id: user.id,
          email: user.email,
          githubId,
          name: user.user_metadata.full_name ?? user.user_metadata.user_name ?? null,
          avatarUrl: user.user_metadata.avatar_url ?? null,
        },
      })
    } catch (dbError) {
      // Do not block login if application DB sync fails after session exchange.
      if (isPrismaConnectivityError(dbError)) {
        isPrismaUserSyncDisabled = true
        console.warn(
          "Prisma user sync disabled for this server process due to database connectivity."
        )
      } else {
        console.error("Failed to sync authenticated user to Prisma", dbError)
      }
    }
  }

  return NextResponse.redirect(redirectTarget)
}