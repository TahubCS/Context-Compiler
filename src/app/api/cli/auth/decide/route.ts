import { NextResponse } from "next/server"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { decideCliAuthRequest } from "@/lib/db"
import { readJsonObject } from "@/lib/mcp-request"

/** Approves or denies a CLI sign-in for the signed-in user's active workspace. */
export async function POST(req: Request) {
  const { user, workspace } = await getAuthenticatedAppContext()
  if (!user || !workspace) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  }

  const body = await readJsonObject(req)
  const userCode = typeof body?.userCode === "string" ? body.userCode : ""
  const decision = body?.decision
  if (!userCode || (decision !== "approve" && decision !== "deny")) {
    return NextResponse.json({ error: "userCode and decision (approve or deny) are required." }, { status: 400 })
  }

  const result = await decideCliAuthRequest({
    userCode,
    approve: decision === "approve",
    userId: user.id,
    workspaceId: workspace.id,
  })
  return result.ok
    ? NextResponse.json({ status: result.status, workspace: { name: workspace.name } })
    : NextResponse.json({ error: result.error }, { status: 410 })
}
