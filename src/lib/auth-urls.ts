export function getOAuthCallbackUrl(origin: string, nextPath?: string) {
  const callback = new URL("/auth/callback", origin)
  if (nextPath) {
    if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
      throw new Error("OAuth redirect path must be an application-relative path.")
    }
    callback.searchParams.set("next", nextPath)
  }
  return callback.toString()
}

export function getSafePostAuthPath(nextPath: string | null) {
  return nextPath?.startsWith("/") && !nextPath.startsWith("//")
    ? nextPath
    : "/dashboard"
}
