import { NextResponse } from "next/server"
import { getWorkspaceRepositories } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"

export async function GET() {
  const { workspace } = await getAuthenticatedAppContext()
  if (!workspace) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const repositories = await getWorkspaceRepositories(workspace.id)

  return NextResponse.json({ repositories })
}
