import { afterEach, describe, expect, test } from "bun:test"
import { getGitHubAppInstallUrl } from "./github-app"
import { decodePendingGitHubAppInstallation, encodePendingGitHubAppInstallation } from "./workspace-session"

const originalSlug = process.env.GITHUB_APP_SLUG
const originalUrl = process.env.GITHUB_APP_INSTALL_URL

afterEach(() => {
  if (originalSlug === undefined) delete process.env.GITHUB_APP_SLUG
  else process.env.GITHUB_APP_SLUG = originalSlug
  if (originalUrl === undefined) delete process.env.GITHUB_APP_INSTALL_URL
  else process.env.GITHUB_APP_INSTALL_URL = originalUrl
})

describe("GitHub App installation", () => {
  test("builds the GitHub installation redirect with opaque state", () => {
    delete process.env.GITHUB_APP_INSTALL_URL
    process.env.GITHUB_APP_SLUG = "context-compiler"
    expect(getGitHubAppInstallUrl("opaque-state"))
      .toBe("https://github.com/apps/context-compiler/installations/select_target?state=opaque-state")
  })

  test("rejects missing or non-GitHub installation configuration", () => {
    delete process.env.GITHUB_APP_INSTALL_URL
    delete process.env.GITHUB_APP_SLUG
    expect(() => getGitHubAppInstallUrl("state")).toThrow("GITHUB_APP_INSTALL_URL or GITHUB_APP_SLUG")
    process.env.GITHUB_APP_INSTALL_URL = "https://evil.example/install"
    expect(() => getGitHubAppInstallUrl("state")).toThrow("https://github.com")
  })

  test("round-trips pending state and rejects malformed cookies", () => {
    const pending = { workspaceId: "workspace-1", state: "unpredictable-state" }
    expect(decodePendingGitHubAppInstallation(encodePendingGitHubAppInstallation(pending))).toEqual(pending)
    expect(decodePendingGitHubAppInstallation("tampered")).toBeNull()
  })
})
