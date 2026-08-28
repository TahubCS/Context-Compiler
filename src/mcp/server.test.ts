import { describe, expect, test } from "bun:test"
import { loadRuntimeConfig } from "./server"

const validEnv = {
  CONTEXT_COMPILER_BASE_URL: "https://context.example.com/",
  CONTEXT_COMPILER_MCP_KEY: "ccmcp_example",
}

describe("MCP runtime configuration", () => {
  test("normalizes the URL and applies a safe timeout default", () => {
    expect(loadRuntimeConfig(validEnv)).toEqual({
      baseUrl: "https://context.example.com",
      mcpKey: "ccmcp_example",
      timeoutMs: 15_000,
    })
  })

  test.each([
    [{ ...validEnv, CONTEXT_COMPILER_BASE_URL: "not-a-url" }, "absolute http(s) URL"],
    [{ ...validEnv, CONTEXT_COMPILER_BASE_URL: "file:///tmp/server" }, "use http or https"],
    [{ ...validEnv, CONTEXT_COMPILER_BASE_URL: "https://user:pass@example.com" }, "must not contain credentials"],
    [{ ...validEnv, CONTEXT_COMPILER_TIMEOUT_MS: "999" }, "between 1000 and 120000"],
  ])("rejects unsafe or invalid configuration", (env, message) => {
    expect(() => loadRuntimeConfig(env)).toThrow(message)
  })

  test("explains how to obtain missing credentials", () => {
    expect(() => loadRuntimeConfig({ CONTEXT_COMPILER_BASE_URL: validEnv.CONTEXT_COMPILER_BASE_URL })).toThrow(
      "Create a repository-bound key"
    )
  })
})
