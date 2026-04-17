import { resolveMcpApiKey, type ResolvedMcpApiKey } from "@/lib/db"

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
