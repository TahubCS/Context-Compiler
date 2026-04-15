import { NextResponse } from "next/server"
import {
  clearWorkspaceRepositories,
  clearWorkspaceGitHubInstallationByInstallationId,
  createGitHubWebhookDelivery,
  getGitHubWebhookDelivery,
  getWorkspaceByInstallationId,
  markGitHubWebhookDeliveryProcessed,
} from "@/lib/db"
import { processGitHubWebhookForWorkspace } from "@/lib/github-repo-sync"
import { verifyGitHubWebhookSignature, type GitHubWebhookPayload } from "@/lib/github-app"

export async function POST(req: Request) {
  const signature = req.headers.get("x-hub-signature-256")
  const eventName = req.headers.get("x-github-event") ?? "unknown"
  const deliveryId = req.headers.get("x-github-delivery")
  const body = await req.text()

  if (!deliveryId) {
    return NextResponse.json({ error: "Missing delivery id." }, { status: 400 })
  }

  if (!verifyGitHubWebhookSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 })
  }

  const existingDelivery = await getGitHubWebhookDelivery(deliveryId)
  if (existingDelivery?.processed) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  let payload: GitHubWebhookPayload
  try {
    payload = JSON.parse(body) as GitHubWebhookPayload
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const installationId = payload.installation?.id ? String(payload.installation.id) : null
  const workspace = installationId ? await getWorkspaceByInstallationId(installationId) : null

  if (!existingDelivery) {
    await createGitHubWebhookDelivery({
      deliveryId,
      eventName,
      installationId,
      workspaceId: workspace?.id ?? null,
    })
  }

  try {
    if (eventName === "installation" && payload.action === "deleted" && installationId) {
      if (workspace) {
        await clearWorkspaceRepositories(workspace.id)
      }
      await clearWorkspaceGitHubInstallationByInstallationId(installationId)
      await markGitHubWebhookDeliveryProcessed(deliveryId)
      return NextResponse.json({ ok: true })
    }

    if (!installationId || !workspace) {
      await markGitHubWebhookDeliveryProcessed(deliveryId, "No matching workspace for installation.")
      return NextResponse.json({ ok: true, ignored: true })
    }

    await processGitHubWebhookForWorkspace({
      userId: workspace.ownerUserId,
      workspaceId: workspace.id,
      eventName,
      payload,
    })

    await markGitHubWebhookDeliveryProcessed(deliveryId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    await markGitHubWebhookDeliveryProcessed(
      deliveryId,
      error instanceof Error ? error.message : "Webhook processing failed."
    )
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 })
  }
}
