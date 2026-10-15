/**
 * Registers the Context Compiler remote MCP server with the coding agents installed on this
 * machine, using each agent's own CLI where it has one.
 */
import { spawnSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

export const SERVER_NAME = "context-compiler"

export type AgentId = "claude" | "codex" | "gemini"
export type Registration = { url: string; key: string }
export type AgentResult = { agent: AgentId; ok: boolean; detail: string }

type RunResult = { status: number | null; stdout: string; stderr: string }

function run(command: string, args: string[]): RunResult {
  // Agent CLIs are .cmd shims on Windows, which only start through a shell.
  const onWindows = process.platform === "win32"
  const result = spawnSync(onWindows ? `"${command}"` : command, onWindows ? args.map((arg) => `"${arg.replace(/"/g, '\\"')}"`) : args, {
    encoding: "utf8",
    shell: onWindows,
    timeout: 60_000,
  })
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? String(result.error ?? "") }
}

export function commandExists(command: string): boolean {
  const lookup = process.platform === "win32" ? "where" : "which"
  return spawnSync(lookup, [command], { stdio: "ignore" }).status === 0
}

export function detectAgents(): AgentId[] {
  return (["claude", "codex", "gemini"] as const).filter((agent) => commandExists(agent))
}

function codexConfigPath(env = process.env) {
  return path.join(env.CODEX_HOME || path.join(os.homedir(), ".codex"), "config.toml")
}

/** Removes `[mcp_servers.<name>]` and its subtables from a Codex config.toml. */
export function removeCodexServer(toml: string, name = SERVER_NAME): string {
  const lines = toml.split(/\r?\n/)
  const kept: string[] = []
  let skipping = false
  for (const line of lines) {
    const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/)
    if (header) {
      const table = header[1].replace(/"/g, "")
      skipping = table === `mcp_servers.${name}` || table.startsWith(`mcp_servers.${name}.`)
    }
    if (!skipping) kept.push(line)
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()
}

export function codexServerBlock({ url, key }: Registration, name = SERVER_NAME): string {
  return [`[mcp_servers.${name}]`, `url = ${JSON.stringify(url)}`, `http_headers = { Authorization = ${JSON.stringify(`Bearer ${key}`)} }`].join("\n")
}

export function upsertCodexServer(toml: string, registration: Registration, name = SERVER_NAME): string {
  const rest = removeCodexServer(toml, name)
  return `${rest ? `${rest}\n\n` : ""}${codexServerBlock(registration, name)}\n`
}

function writePrivate(file: string, contents: string) {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, contents, { mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    // Best effort on filesystems without POSIX modes.
  }
}

export function registerAgent(agent: AgentId, registration: Registration): AgentResult {
  const header = `Authorization: Bearer ${registration.key}`
  if (agent === "claude") {
    run("claude", ["mcp", "remove", SERVER_NAME, "-s", "user"])
    const result = run("claude", ["mcp", "add", "--transport", "http", "-s", "user", SERVER_NAME, registration.url, "--header", header])
    return { agent, ok: result.status === 0, detail: result.status === 0 ? "registered for all projects (user scope)" : result.stderr.trim() || result.stdout.trim() }
  }
  if (agent === "gemini") {
    run("gemini", ["mcp", "remove", "-s", "user", SERVER_NAME])
    const result = run("gemini", ["mcp", "add", "-s", "user", "--transport", "http", "--header", header, SERVER_NAME, registration.url])
    return {
      agent,
      ok: result.status === 0,
      detail:
        result.status === 0
          ? "registered for all projects (user scope); Gemini only enables MCP servers in folders you have trusted"
          : result.stderr.trim() || result.stdout.trim(),
    }
  }
  // Codex's `mcp add` has no header flag, so edit its config file directly.
  const file = codexConfigPath()
  const current = existsSync(file) ? readFileSync(file, "utf8") : ""
  writePrivate(file, upsertCodexServer(current, registration))
  return { agent, ok: true, detail: `wrote ${file}` }
}

export function unregisterAgent(agent: AgentId): AgentResult {
  if (agent === "claude") {
    const result = run("claude", ["mcp", "remove", SERVER_NAME, "-s", "user"])
    return { agent, ok: result.status === 0, detail: result.status === 0 ? "removed" : "not registered" }
  }
  if (agent === "gemini") {
    const result = run("gemini", ["mcp", "remove", "-s", "user", SERVER_NAME])
    return { agent, ok: result.status === 0, detail: result.status === 0 ? "removed" : "not registered" }
  }
  const file = codexConfigPath()
  if (!existsSync(file)) return { agent, ok: false, detail: "not registered" }
  const current = readFileSync(file, "utf8")
  const next = removeCodexServer(current)
  if (next === current.trimEnd()) return { agent, ok: false, detail: "not registered" }
  writePrivate(file, next ? `${next}\n` : "")
  return { agent, ok: true, detail: `removed from ${file}` }
}

export function isRegistered(agent: AgentId): boolean {
  if (agent === "claude") return run("claude", ["mcp", "get", SERVER_NAME]).status === 0
  if (agent === "gemini") {
    // Gemini CLI prints its server list to stderr.
    const result = run("gemini", ["mcp", "list"])
    return `${result.stdout}${result.stderr}`.includes(SERVER_NAME)
  }
  const file = codexConfigPath()
  return existsSync(file) && readFileSync(file, "utf8").includes(`[mcp_servers.${SERVER_NAME}]`)
}

/**
 * Writes a project-level .mcp.json (Claude Code and other clients read it) that pins this
 * folder's repository and reads the key from CONTEXT_COMPILER_MCP_KEY, so it can be committed.
 */
export function writeProjectConfig(dir: string, url: string, repository: string | null): string {
  const file = path.join(dir, ".mcp.json")
  let config: { mcpServers?: Record<string, unknown> } = {}
  if (existsSync(file)) {
    try {
      config = JSON.parse(readFileSync(file, "utf8")) as typeof config
    } catch {
      throw new Error(`${file} is not valid JSON; fix or remove it first.`)
    }
  }
  config.mcpServers = {
    ...(config.mcpServers ?? {}),
    [SERVER_NAME]: {
      type: "http",
      url,
      headers: {
        Authorization: "Bearer ${CONTEXT_COMPILER_MCP_KEY}",
        ...(repository ? { "X-Context-Compiler-Repository": repository } : {}),
      },
    },
  }
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`)
  return file
}
