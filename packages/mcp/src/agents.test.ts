import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { removeCodexServer, upsertCodexServer, writeProjectConfig } from "./agents"

const registration = { url: "https://cc.example.com/api/mcp", key: "ccmcp_abc" }

describe("Codex config.toml editing", () => {
  test("adds the server to an empty config", () => {
    expect(upsertCodexServer("", registration)).toBe(
      '[mcp_servers.context-compiler]\nurl = "https://cc.example.com/api/mcp"\nhttp_headers = { Authorization = "Bearer ccmcp_abc" }\n'
    )
  })

  test("replaces an existing entry and its subtables, keeping everything else", () => {
    const existing = [
      'model = "gpt-5"',
      "",
      "[mcp_servers.context-compiler]",
      'command = "bun"',
      "",
      "[mcp_servers.context-compiler.env]",
      'CONTEXT_COMPILER_MCP_KEY = "old"',
      "",
      "[mcp_servers.other]",
      'url = "https://other.example.com"',
    ].join("\n")
    const updated = upsertCodexServer(existing, registration)
    expect(updated).toContain('model = "gpt-5"')
    expect(updated).toContain("[mcp_servers.other]")
    expect(updated).not.toContain('command = "bun"')
    expect(updated).not.toContain("old")
    expect(updated.match(/\[mcp_servers\.context-compiler\]/g)).toHaveLength(1)
  })

  test("removal leaves other servers untouched", () => {
    const toml = '[mcp_servers.other]\nurl = "x"\n\n[mcp_servers.context-compiler]\nurl = "y"\n'
    expect(removeCodexServer(toml)).toBe('[mcp_servers.other]\nurl = "x"')
  })
})

describe("project .mcp.json", () => {
  test("merges with existing servers and reads the key from the environment", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "cc-mcp-"))
    writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: { other: { command: "x" } } }))
    writeProjectConfig(dir, registration.url, "acme/demo")
    const config = JSON.parse(readFileSync(path.join(dir, ".mcp.json"), "utf8"))
    expect(config.mcpServers.other).toEqual({ command: "x" })
    expect(config.mcpServers["context-compiler"]).toEqual({
      type: "http",
      url: registration.url,
      headers: {
        Authorization: "Bearer ${CONTEXT_COMPILER_MCP_KEY}",
        "X-Context-Compiler-Repository": "acme/demo",
      },
    })
  })
})
