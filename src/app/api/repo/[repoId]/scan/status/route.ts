import { NextResponse } from "next/server"
import { ScanJobStatus } from "@prisma/client"
import { isPrismaConnectivityError, updateScanJobStatus } from "@/lib/db"

type RouteParams = { params: Promise<{ repoId: string }> }

type StatusCallbackBody = {
  scanJobId?: string
  scanStatus: ScanJobStatus
  indexedCommitSha?: string
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
  const scanJobId = body.scanJobId?.trim()

  if (!scanJobId) {
    return NextResponse.json({ error: "scanJobId is required" }, { status: 400 })
  }

  try {
    await updateScanJobStatus(scanJobId, repoId, {
      status: scanStatus,
      filesDiscovered,
      filesProcessed,
      errorMessage: errorMessage ?? null,
      indexedCommitSha: body.indexedCommitSha ?? null,
    })
  } catch (error) {
    if (isPrismaConnectivityError(error)) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    }
    throw error
  }

  return NextResponse.json({ ok: true })
}
