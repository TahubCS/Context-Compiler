import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/client' // We'll build this next!

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    // This exchanges the "code" from GitHub for a real user session
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Once logged in, send them to the dashboard
  return NextResponse.redirect(`${origin}/dashboard`)
}