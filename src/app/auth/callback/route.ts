import { upsertSupabaseUser, isPrismaConnectivityError, updateUserGithubToken } from "@/lib/db"
import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

let isPrismaUserSyncDisabled = false

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

  if (!isPrismaUserSyncDisabled) {
    try {
      await upsertSupabaseUser(user)

      // Persist the GitHub OAuth token while we have it — Supabase drops
      // provider_token from the session after the first token refresh,
      // so this is the only reliable moment to capture it.
      const providerToken = data.session?.provider_token
      if (providerToken) {
        await updateUserGithubToken(user.id, providerToken)
      }
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
