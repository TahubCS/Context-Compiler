import { NextResponse } from "next/server"
import { RepositoryScanStatus } from "@prisma/client"
import { updateRepositoryScanStatus, isPrismaConnectivityError } from "@/lib/db"

type RouteParams = { params: Promise<{ repoId: string }> }

type StatusCallbackBody = {
  scanStatus: RepositoryScanStatus
  filesDiscovered?: number
  filesProcessed?: number
  errorMessage?: string
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const { repoId } = await params

  const secret = req.headers.get("x-callback-secret")
  if (!secret || secret !== process.env.AI_CALLBACK_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let body: StatusCallbackBody
  try {
    body = (await req.json()) as StatusCallbackBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const { scanStatus, filesDiscovered, filesProcessed, errorMessage } = body

  try {
    await updateRepositoryScanStatus(repoId, {
      scanStatus,
      filesDiscovered,
      filesProcessed,
      errorMessage: errorMessage ?? null,
      lastScannedAt: scanStatus === "COMPLETED" ? new Date() : undefined,
    })
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }

  return NextResponse.json({ ok: true })
}
