function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "")
}

export function getAiBackendUrl(): string | null {
  const raw = process.env.AI_BACKEND_URL?.trim()
  if (!raw) {
    return null
  }

  return trimTrailingSlash(raw)
}

export function getAppBaseUrl(req?: Request): string {
  const configured =
    process.env.NEXT_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim()

  if (configured) {
    const normalized = configured.startsWith("http")
      ? configured
      : `https://${configured}`
    return trimTrailingSlash(normalized)
  }

  if (!req) {
    throw new Error("Unable to resolve app base URL without a request or configured env.")
  }

  return trimTrailingSlash(new URL(req.url).origin)
}

/** Headers for every request to the AI backend, which rejects calls without the shared secret. */
export function getAiBackendHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const secret = process.env.AI_BACKEND_SECRET?.trim()
  if (secret) {
    headers.Authorization = `Bearer ${secret}`
  }
  return headers
}

/**
 * Where the AI backend sends scan progress. Defaults to the app's public URL; set
 * AI_CALLBACK_BASE_URL when the backend reaches the app at a different address
 * (for example http://web:3000 inside Docker Compose).
 */
export function getScanCallbackBaseUrl(appBaseUrl: string): string {
  const configured = process.env.AI_CALLBACK_BASE_URL?.trim()
  return trimTrailingSlash(configured || appBaseUrl)
}
