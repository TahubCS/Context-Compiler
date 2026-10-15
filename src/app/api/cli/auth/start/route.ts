import { NextResponse } from "next/server"
import { CLI_AUTH_TTL_MS, startCliAuthRequest } from "@/lib/db"
import { readJsonObject } from "@/lib/mcp-request"
import { getAppBaseUrl } from "@/lib/runtime-urls"

/**
 * Starts a CLI sign-in. The CLI sends the key it generated; the user then approves the
 * returned code at /connect, which activates that key. Polling: GET /api/cli/auth/status.
 */
export async function POST(req: Request) {
  const body = await readJsonObject(req)
  const key = typeof body?.key === "string" ? body.key : ""
  const clientName = typeof body?.clientName === "string" && body.clientName.trim() ? body.clientName.trim() : "CLI"

  try {
    const request = await startCliAuthRequest(key, clientName)
    const baseUrl = getAppBaseUrl(req)
    return NextResponse.json({
      userCode: request.userCode,
      verificationUri: `${baseUrl}/connect`,
      verificationUriComplete: `${baseUrl}/connect?code=${encodeURIComponent(request.userCode)}`,
      expiresIn: Math.round(CLI_AUTH_TTL_MS / 1000),
      interval: 2,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start sign-in."
    const status = message.includes("malformed") ? 400 : 500
    if (status === 500) console.error("CLI auth start failed", error)
    return NextResponse.json({ error: message }, { status })
  }
}
