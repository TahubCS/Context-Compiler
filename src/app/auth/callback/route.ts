import { updateUserGithubToken, upsertSupabaseUser } from "@/lib/db"
import { getSafePostAuthPath } from "@/lib/auth-urls"
import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const nextPath = requestUrl.searchParams.get("next")
  const redirectTarget = new URL(getSafePostAuthPath(nextPath), requestUrl.origin)

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

  try {
    await upsertSupabaseUser(user)
    // The provider token is optional for login. Store it when Supabase returns it;
    // GitHub App installations are the primary repository-access mechanism.
    const providerToken = data.session?.provider_token
    if (providerToken) {
      await updateUserGithubToken(user.id, providerToken)
    }
  } catch (error) {
    console.error("Authentication provisioning failed", {
      category: "user_workspace_provisioning",
      errorName: error instanceof Error ? error.name : "unknown",
    })
    return NextResponse.redirect(
      `${requestUrl.origin}/auth/auth-code-error?reason=provisioning_failed`
    )
  }

  return NextResponse.redirect(redirectTarget)
}
