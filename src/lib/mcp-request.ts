import { NextResponse } from "next/server"
import { resolveMcpApiKey, type ResolvedMcpApiKey } from "@/lib/db"
import type { McpOperationResult } from "@/lib/mcp-operations"

function extractBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization")?.trim()
  if (!authorization) {
    return null
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

export async function authenticateMcpRequest(request: Request): Promise<ResolvedMcpApiKey | null> {
  const token = extractBearerToken(request)
  if (!token) {
    return null
  }

  return resolveMcpApiKey(token)
}

export function mcpUnauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized: the MCP key is missing, malformed, or revoked." },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="context-compiler"' } }
  )
}

export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function operationResponse<T>(result: McpOperationResult<T>) {
  return result.ok
    ? NextResponse.json(result.data)
    : NextResponse.json({ error: result.error }, { status: result.status })
}

/** Clients can set a default repository for workspace keys, e.g. per project. */
export const DEFAULT_REPOSITORY_HEADER = "x-context-compiler-repository"

/** The repository a request asks for: the explicit argument, else the client's default header. */
export function requestedRepository(req: Request, explicit?: unknown): string | null {
  if (typeof explicit === "string" && explicit.trim()) return explicit
  return req.headers.get(DEFAULT_REPOSITORY_HEADER)
}
