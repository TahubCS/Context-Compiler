/**
 * context-compiler-mcp: connect coding agents to Context Compiler.
 *
 *   npx context-compiler-mcp connect --url https://your-context-compiler
 *
 * `connect` signs in through the browser (no key copying) and registers the remote MCP
 * server with every supported agent CLI found on this machine. With no command, the
 * process serves the tools over stdio for clients that cannot use remote servers.
 */
import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  createHttpBackend,
  createLocalChangesReader,
  detectDefaultRepository,
  detectLocalCheckout,
  loadRuntimeConfig,
  startStdioServer,
} from "../../../src/mcp/server"
import { MCP_SERVER_VERSION, type SessionResponse } from "../../../src/mcp/tools"
import {
  detectAgents,
  isRegistered,
  registerAgent,
  unregisterAgent,
  writeProjectConfig,
  type AgentId,
} from "./agents"

type SavedConfig = { baseUrl: string; key: string }

const CONFIG_FILE = path.join(
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
  "context-compiler",
  "config.json"
)

const HELP = `context-compiler-mcp ${MCP_SERVER_VERSION}

Usage:
  context-compiler-mcp connect --url <app-url> [--agents claude,codex,gemini] [--project] [--no-open]
      Sign in through the browser, then register Context Compiler with your agents.
      --project also writes .mcp.json in this folder, pinned to its repository.
  context-compiler-mcp doctor        Check the saved key and each agent's registration.
  context-compiler-mcp disconnect    Remove the registrations and revoke the key.
  context-compiler-mcp [serve]       Serve the tools over stdio (for clients without
                                     remote MCP support).

The key is saved in ${CONFIG_FILE}.
Environment: CONTEXT_COMPILER_BASE_URL, CONTEXT_COMPILER_MCP_KEY and
CONTEXT_COMPILER_REPOSITORY override the saved values.`

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  return value && !value.startsWith("--") ? value : ""
}

function readConfig(): SavedConfig | null {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as SavedConfig
  } catch {
    return null
  }
}

function saveConfig(config: SavedConfig) {
  mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  writeFileSync(CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value)
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("The URL must start with https:// (or http:// for local development).")
  return url.origin
}

function openBrowser(url: string) {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]]
  try {
    spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref()
  } catch {
    // The URL is printed too; opening the browser is a convenience.
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
  const text = await response.text()
  let data: T
  try {
    data = (text ? JSON.parse(text) : {}) as T
  } catch {
    throw new Error(`${url} returned a non-JSON response (HTTP ${response.status}). Is this the Context Compiler web app URL?`)
  }
  return { status: response.status, data }
}

function sessionFor(baseUrl: string, key: string): Promise<SessionResponse> {
  return createHttpBackend(() => ({ baseUrl, mcpKey: key, timeoutMs: 20_000 })).session()
}

function describeSession(session: SessionResponse) {
  if (session.repository) return `repository key for ${session.repository.fullName}`
  const names = session.repositories.map((repository) => repository.fullName)
  return `workspace key for ${session.workspace.name} (${names.length} repositories${names.length ? `: ${names.slice(0, 5).join(", ")}${names.length > 5 ? ", ..." : ""}` : ""})`
}

function selectedAgents(): AgentId[] {
  const requested = flag("agents")
  const installed = detectAgents()
  if (!requested) return installed
  const wanted = requested.split(",").map((name) => name.trim().toLowerCase()) as AgentId[]
  for (const agent of wanted) {
    if (!["claude", "codex", "gemini"].includes(agent)) throw new Error(`Unknown agent "${agent}". Use claude, codex or gemini.`)
  }
  // Codex is configured through its config file, so it does not need to be on PATH.
  return wanted.filter((agent) => agent === "codex" || installed.includes(agent))
}

async function connect() {
  const saved = readConfig()
  const urlInput = flag("url") || process.env.CONTEXT_COMPILER_BASE_URL || saved?.baseUrl
  if (!urlInput) throw new Error("Pass the Context Compiler URL: context-compiler-mcp connect --url https://your-context-compiler")
  const baseUrl = normalizeBaseUrl(urlInput)
  const agents = selectedAgents()

  // The key is generated here and sent once; the server keeps only its hash and activates
  // it when you approve the code in the browser.
  const key = `ccmcp_${randomBytes(32).toString("base64url")}`
  const clientName = `${os.userInfo().username}@${os.hostname()} (${process.platform})`
  const started = await fetchJson<{
    userCode?: string
    verificationUriComplete?: string
    interval?: number
    expiresIn?: number
    error?: string
  }>(`${baseUrl}/api/cli/auth/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, clientName }),
  })
  if (started.status !== 200 || !started.data.userCode || !started.data.verificationUriComplete) {
    throw new Error(started.data.error ?? `Could not start sign-in (HTTP ${started.status}).`)
  }

  console.log(`\nConfirm this code in your browser: ${started.data.userCode}`)
  console.log(`  ${started.data.verificationUriComplete}\n`)
  if (flag("no-open") === undefined) openBrowser(started.data.verificationUriComplete)

  const deadline = Date.now() + (started.data.expiresIn ?? 600) * 1000
  const interval = Math.max(1, started.data.interval ?? 2) * 1000
  let status = "pending"
  while (status === "pending" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval))
    const poll = await fetchJson<{ status?: string; error?: string }>(`${baseUrl}/api/cli/auth/status`, {
      headers: { Authorization: `Bearer ${key}` },
    }).catch(() => ({ status: 0, data: { status: "pending" } }))
    status = poll.data.status ?? "pending"
  }
  if (status !== "approved") {
    throw new Error(status === "denied" ? "The request was denied in the browser." : "The code expired before it was approved. Run connect again.")
  }

  saveConfig({ baseUrl, key })
  const session = await sessionFor(baseUrl, key)
  console.log(`Signed in: ${describeSession(session)}`)

  const registration = { url: `${baseUrl}/api/mcp`, key }
  if (agents.length === 0) {
    console.log("\nNo supported agent CLI (claude, codex, gemini) was found on PATH.")
    console.log(`Add the server manually: URL ${registration.url}, header "Authorization: Bearer <key from ${CONFIG_FILE}>".`)
  }
  for (const agent of agents) {
    const result = registerAgent(agent, registration)
    console.log(`  ${result.ok ? "✓" : "✗"} ${agent}: ${result.detail}`)
  }

  if (flag("project") !== undefined) {
    const repository = detectDefaultRepository()
    const file = writeProjectConfig(process.cwd(), registration.url, repository)
    console.log(`  ✓ wrote ${file}${repository ? ` (pinned to ${repository})` : ""}`)
    console.log("    It reads the key from CONTEXT_COMPILER_MCP_KEY, so it is safe to commit; each person sets their own key.")
  }

  console.log("\nDone. Restart your agents, then run /mcp in Claude Code or Gemini CLI to see context-compiler.")
  if (!session.repository && session.repositories.length > 1) {
    console.log("This key covers several repositories: agents pass `repository` (owner/name) on each call, or call list_repositories.")
  }
}

async function doctor() {
  const config = readConfig()
  const baseUrl = process.env.CONTEXT_COMPILER_BASE_URL || config?.baseUrl
  const key = process.env.CONTEXT_COMPILER_MCP_KEY || config?.key
  if (!baseUrl || !key) throw new Error(`Not connected. Run: context-compiler-mcp connect --url <app-url>`)

  const session = await sessionFor(normalizeBaseUrl(baseUrl), key)
  console.log(`OK: ${describeSession(session)} at ${baseUrl}`)
  const here = detectDefaultRepository()
  if (here) console.log(`This folder's repository: ${here}`)
  for (const agent of ["claude", "codex", "gemini"] as const) {
    const installed = agent === "codex" || detectAgents().includes(agent)
    console.log(`  ${agent}: ${!installed ? "not installed" : isRegistered(agent) ? "registered" : "not registered (run connect)"}`)
  }
}

async function disconnect() {
  for (const agent of ["claude", "codex", "gemini"] as const) {
    if (agent !== "codex" && !detectAgents().includes(agent)) continue
    const result = unregisterAgent(agent)
    console.log(`  ${agent}: ${result.detail}`)
  }
  const config = readConfig()
  if (config) {
    const response = await fetch(`${config.baseUrl}/api/mcp/session`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${config.key}` },
    }).catch(() => null)
    console.log(response?.ok ? "  key revoked" : "  could not revoke the key; revoke it in the web app")
    rmSync(CONFIG_FILE, { force: true })
  }
  console.log("Disconnected.")
}

async function serve() {
  const config = readConfig()
  const env = {
    ...process.env,
    CONTEXT_COMPILER_BASE_URL: process.env.CONTEXT_COMPILER_BASE_URL || config?.baseUrl,
    CONTEXT_COMPILER_MCP_KEY: process.env.CONTEXT_COMPILER_MCP_KEY || config?.key,
  }
  const checkout = detectLocalCheckout(env)
  const defaultRepository = checkout?.repository ?? null
  await startStdioServer(
    createHttpBackend(() => loadRuntimeConfig(env), defaultRepository, createLocalChangesReader(checkout)),
    defaultRepository
  )
}

async function main() {
  const command = process.argv[2] ?? "serve"
  switch (command) {
    case "connect":
      return connect()
    case "doctor":
      return doctor()
    case "disconnect":
      return disconnect()
    case "serve":
      return serve()
    case "help":
    case "--help":
    case "-h":
      console.log(HELP)
      return
    case "--version":
      console.log(MCP_SERVER_VERSION)
      return
    default:
      throw new Error(`Unknown command "${command}". Run context-compiler-mcp --help.`)
  }
}

main().catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

