import { NextResponse } from "next/server"
import { getCliAuthStatus } from "@/lib/db"

/** Polled by the CLI with its pending key as the Bearer token. */
export async function GET(req: Request) {
  const key = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!key) {
    return NextResponse.json({ error: "Missing Bearer key" }, { status: 401 })
  }

  const status = await getCliAuthStatus(key)
  if (!status) {
    return NextResponse.json({ error: "Unknown sign-in request" }, { status: 404 })
  }
  return NextResponse.json({ status })
}
