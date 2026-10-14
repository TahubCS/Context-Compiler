import { prisma } from "./client"

export type McpToolCallRecord = {
  apiKeyId: string
  repositoryId: string | null
  tool: string
  ok: boolean
  durationMs: number
  resultCount?: number | null
  responseTokens?: number | null
  fullFileTokens?: number | null
}

/** Fire-and-forget: usage logging must never fail or slow a tool call. */
export function recordMcpToolCall(record: McpToolCallRecord): void {
  void prisma.mcpToolCall.create({ data: record }).catch(() => {})
}

export type McpKeyUsage = {
  calls: number
  failures: number
  packTokens: number
  packFullFileTokens: number
}

/** Calls per key over the last `days` days, with context-pack token totals. */
export async function getMcpKeyUsage(apiKeyIds: string[], days = 7): Promise<Map<string, McpKeyUsage>> {
  if (apiKeyIds.length === 0) return new Map()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const rows = await prisma.mcpToolCall.groupBy({
    by: ["apiKeyId", "tool", "ok"],
    where: { apiKeyId: { in: apiKeyIds }, createdAt: { gte: since } },
    _count: { _all: true },
    _sum: { responseTokens: true, fullFileTokens: true },
  })
  const usage = new Map<string, McpKeyUsage>()
  for (const row of rows) {
    const entry = usage.get(row.apiKeyId) ?? { calls: 0, failures: 0, packTokens: 0, packFullFileTokens: 0 }
    entry.calls += row._count._all
    if (!row.ok) entry.failures += row._count._all
    if (row.tool === "build_context_pack" && row.ok) {
      entry.packTokens += row._sum.responseTokens ?? 0
      entry.packFullFileTokens += row._sum.fullFileTokens ?? 0
    }
    usage.set(row.apiKeyId, entry)
  }
  return usage
}
