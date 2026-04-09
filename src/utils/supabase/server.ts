import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/client'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && data.user) {
      // SYNC: Create or update the user in your Prisma database
      await prisma.user.upsert({
        where: { id: data.user.id },
        update: {
          email: data.user.email!,
          name: data.user.user_metadata.full_name,
          avatarUrl: data.user.user_metadata.avatar_url,
        },
        create: {
          id: data.user.id,
          email: data.user.email!,
          name: data.user.user_metadata.full_name,
          avatarUrl: data.user.user_metadata.avatar_url,
        },
      })
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}