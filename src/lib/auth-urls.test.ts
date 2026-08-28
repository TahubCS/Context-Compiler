import { describe, expect, test } from "bun:test"
import { getOAuthCallbackUrl, getSafePostAuthPath } from "./auth-urls"

describe("GitHub OAuth redirects", () => {
  test("uses the current Vercel Preview origin", () => {
    expect(getOAuthCallbackUrl("https://context-compiler-git-fix.vercel.app", "/settings"))
      .toBe("https://context-compiler-git-fix.vercel.app/auth/callback?next=%2Fsettings")
  })

  test("rejects external and protocol-relative post-login redirects", () => {
    expect(() => getOAuthCallbackUrl("https://example.com", "https://evil.example"))
      .toThrow("application-relative")
    expect(getSafePostAuthPath("//evil.example")).toBe("/dashboard")
  })
})
