import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAiBackendHeaders, getAiBackendUrl } from "@/lib/runtime-urls"

export const dynamic = "force-dynamic"

type Check = { ok: boolean; message: string }

async function checkDatabase(): Promise<Record<string, Check>> {
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    return { database: { ok: false, message: "Cannot reach the database. Check DATABASE_URL." } }
  }

  const [index] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_code_documents_embedding'
  `
  const [tokens] = await prisma.$queryRaw<Array<{ present: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'CodeDocument' AND column_name = 'searchTokens'
    ) AS present
  `
  return {
    database: { ok: true, message: "Connected." },
    vectorIndex: /using hnsw/i.test(index?.indexdef ?? "")
      ? { ok: true, message: "HNSW index on embeddings." }
      : { ok: false, message: "Embedding index is missing or not HNSW; run bun ./scripts/ensure-vector-index.ts." },
    searchIndex: tokens?.present
      ? { ok: true, message: "Search-token column present." }
      : { ok: false, message: "CodeDocument.searchTokens is missing; apply migration 0013 or run bun run db:setup." },
  }
}

async function checkAiBackend(): Promise<Check> {
  const url = getAiBackendUrl()
  if (!url) return { ok: false, message: "AI_BACKEND_URL is not set." }
  try {
    const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) })
    if (!health.ok) return { ok: false, message: `AI backend /health returned HTTP ${health.status}.` }
    // An authenticated request with an invalid body: 400 means the shared secret matched.
    const probe = await fetch(`${url}/embed`, {
      method: "POST",
      headers: getAiBackendHeaders(),
      body: JSON.stringify({ text: "" }),
      signal: AbortSignal.timeout(5000),
    })
    if (probe.status === 401) return { ok: false, message: "AI backend rejected AI_BACKEND_SECRET; set the same value on both services." }
    return { ok: true, message: "Reachable, and the shared secret matches." }
  } catch {
    return { ok: false, message: "Cannot reach the AI backend. Check AI_BACKEND_URL and that the service is running." }
  }
}

function checkConfig(): Record<string, Check> {
  const set = (name: string) => Boolean(process.env[name]?.trim())
  return {
    mcpKeys: set("MCP_API_KEY_SECRET")
      ? { ok: true, message: "MCP key secret configured." }
      : { ok: false, message: "MCP_API_KEY_SECRET is not set; MCP keys cannot be created or used." },
    githubApp: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_WEBHOOK_SECRET"].every(set)
      ? { ok: true, message: "GitHub App configured." }
      : { ok: false, message: "GitHub App settings are incomplete; repository import and push-triggered scans will not work." },
  }
}

/** Service health for operators and uptime checks. Reports configuration state, never values. */
export async function GET() {
  const [database, aiBackend] = await Promise.all([checkDatabase(), checkAiBackend()])
  const checks = { ...database, aiBackend, ...checkConfig() }
  const ok = Object.values(checks).every((check) => check.ok)
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 })
}
