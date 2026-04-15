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
