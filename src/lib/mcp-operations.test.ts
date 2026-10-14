import { describe, expect, test } from "bun:test"
import type { ResolvedMcpApiKey } from "@/lib/db"
import { normalizeRepositoryRef, resolveRepository } from "./mcp-operations"
import { repositoryFromRemote } from "@/mcp/server"

describe("normalizeRepositoryRef", () => {
  test.each([
    ["Acme/Demo", "acme/demo"],
    ["https://github.com/acme/demo", "acme/demo"],
    ["https://github.com/acme/demo.git", "acme/demo"],
    ["git@github.com:acme/demo.git", "acme/demo"],
    ["ssh://git@github.com/acme/demo", "acme/demo"],
    [" acme/demo/ ", "acme/demo"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeRepositoryRef(input)).toBe(expected)
  })
})

describe("repositoryFromRemote", () => {
  test.each([
    ["https://github.com/acme/demo.git\n", "acme/demo"],
    ["git@github.com:acme/demo.git", "acme/demo"],
    ["https://x-access-token:abc@github.com/acme/demo", "acme/demo"],
    ["not a remote", null],
  ])("%s -> %s", (input, expected) => {
    expect(repositoryFromRemote(input)).toBe(expected)
  })
})

describe("resolveRepository with a repository key", () => {
  const repository = {
    id: "r1",
    fullName: "Acme/Demo",
    defaultBranch: "main",
    scanStatus: "COMPLETED",
    lastIndexedCommitSha: "abc",
    indexFormatVersion: 3,
    lastScannedAt: null,
  }
  const apiKey = {
    repository,
    workspace: { id: "w1", name: "Acme", slug: "acme" },
  } as unknown as ResolvedMcpApiKey

  test("uses the bound repository when none is requested", async () => {
    expect(await resolveRepository(apiKey, undefined)).toEqual({ ok: true, data: repository })
  })

  test("accepts the bound repository in any form", async () => {
    expect((await resolveRepository(apiKey, "git@github.com:acme/demo.git")).ok).toBe(true)
  })

  test("refuses other repositories", async () => {
    const result = await resolveRepository(apiKey, "acme/other")
    expect(result).toMatchObject({ ok: false, status: 403 })
  })
})
