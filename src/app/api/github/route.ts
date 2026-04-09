import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repositories = await prisma.repository.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      fullName: true,
      githubUrl: true,
      defaultBranch: true,
      isPrivate: true,
      scanStatus: true,
      lastScannedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  })

  return NextResponse.json({ repositories })
}
