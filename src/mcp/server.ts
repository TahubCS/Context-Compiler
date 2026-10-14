import { execFileSync } from "node:child_process"
import path from "node:path"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  registerContextCompilerTools,
  type AnswerResponse,
  type ContextPackResponse,
  type FileResponse,
  type LocalChanges,
  type RepositoriesResponse,
  type RepositoryInfo,
  type SearchResponse,
  type SessionResponse,
  type ToolBackend,
  type TraceResponse,
} from "./tools"

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

type RuntimeConfig = { baseUrl: string; mcpKey: string; timeoutMs: number }

const DEFAULT_REPOSITORY_HEADER = "X-Context-Compiler-Repository"
// This bridge's own checkout: `bun run --cwd <clone> mcp:stdio` makes it the process cwd,
// and its git remote is never the repository the agent is working on.
const BRIDGE_ROOT = path.resolve(import.meta.dirname ?? __dirname, "..", "..")

/** "owner/name" from a git remote URL (https or ssh), or null. */
export function repositoryFromRemote(remote: string): string | null {
  const match = remote.trim().match(/(?:[:/])([^/:\s]+\/[^/\s]+?)(?:\.git)?\/?$/)
  return match ? match[1] : null
}

function git(dir: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", dir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    }).trim()
  } catch {
    return null
  }
}

export type LocalCheckout = { repository: string; dir: string | null }

/**
 * The repository the agent is working in: CONTEXT_COMPILER_REPOSITORY, else the origin
 * remote of the directory the client started us from. Used as the default `repository`
 * for workspace keys (repository keys ignore it) and to compare the index with local code.
 */
export function detectLocalCheckout(env: Record<string, string | undefined> = process.env): LocalCheckout | null {
  const candidates = [env.INIT_CWD, env.PWD, process.cwd()].filter(
    (dir): dir is string => Boolean(dir) && path.resolve(dir as string) !== BRIDGE_ROOT
  )
  const explicit = env.CONTEXT_COMPILER_REPOSITORY?.trim()
  for (const dir of new Set(candidates)) {
    const remote = git(dir, ["remote", "get-url", "origin"])
    const repository = remote ? repositoryFromRemote(remote) : null
    if (repository && (!explicit || repository.toLowerCase() === explicit.toLowerCase())) {
      return { repository: explicit ?? repository, dir: git(dir, ["rev-parse", "--show-toplevel"]) ?? dir }
    }
  }
  return explicit ? { repository: explicit, dir: null } : null
}

export function detectDefaultRepository(env: Record<string, string | undefined> = process.env): string | null {
  return detectLocalCheckout(env)?.repository ?? null
}

const LOCAL_CHANGES_TTL_MS = 30_000

/**
 * Compares the agent's checkout with the commit a repository was indexed at: files changed
 * since that commit plus uncommitted edits. Null when the checkout is not that repository.
 */
export function createLocalChangesReader(checkout: LocalCheckout | null) {
  const cache = new Map<string, { at: number; value: LocalChanges | null }>()
  return (repository: RepositoryInfo): LocalChanges | null => {
    const indexed = repository.lastIndexedCommitSha
    if (!checkout?.dir || !indexed || checkout.repository.toLowerCase() !== repository.fullName.toLowerCase()) {
      return null
    }
    const cached = cache.get(indexed)
    if (cached && Date.now() - cached.at < LOCAL_CHANGES_TTL_MS) return cached.value

    const dir = checkout.dir
    const headSha = git(dir, ["rev-parse", "HEAD"])
    let value: LocalChanges | null = null
    if (headSha) {
      const hasIndexed = git(dir, ["cat-file", "-e", `${indexed}^{commit}`]) !== null
      const changed = new Set<string>()
      if (hasIndexed) {
        // Working tree against the indexed commit: committed and uncommitted changes.
        for (const file of (git(dir, ["diff", "--name-only", indexed]) ?? "").split("\n")) if (file) changed.add(file)
      }
      // Uncommitted edits to tracked files (already covered above when the indexed commit
      // exists locally) and new untracked files.
      for (const file of (git(dir, ["diff", "--name-only", "HEAD"]) ?? "").split("\n")) if (file) changed.add(file)
      for (const file of (git(dir, ["ls-files", "--others", "--exclude-standard"]) ?? "").split("\n")) if (file) changed.add(file)
      const behind = hasIndexed ? Number(git(dir, ["rev-list", "--count", `${indexed}..HEAD`])) : NaN
      value = {
        headSha,
        commitsBehind: Number.isFinite(behind) ? behind : null,
        changedFiles: [...changed].sort(),
      }
    }
    cache.set(indexed, { at: Date.now(), value })
    return value
  }
}

export function loadRuntimeConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  const baseUrlValue = env.CONTEXT_COMPILER_BASE_URL?.trim()
  const mcpKey = env.CONTEXT_COMPILER_MCP_KEY?.trim()
  if (!baseUrlValue) throw new Error("Missing CONTEXT_COMPILER_BASE_URL. Set it to the Context Compiler web app origin (for example, https://context.example.com).")
  if (!mcpKey) throw new Error("Missing CONTEXT_COMPILER_MCP_KEY. Create a repository-bound key in Context Compiler, then provide it to the MCP process.")

  let baseUrl: URL
  try { baseUrl = new URL(baseUrlValue) } catch { throw new Error("CONTEXT_COMPILER_BASE_URL must be an absolute http(s) URL.") }
  if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error("CONTEXT_COMPILER_BASE_URL must use http or https.")
  if (baseUrl.username || baseUrl.password) throw new Error("CONTEXT_COMPILER_BASE_URL must not contain credentials.")

  const timeoutMs = Number(env.CONTEXT_COMPILER_TIMEOUT_MS ?? "60000")
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new Error("CONTEXT_COMPILER_TIMEOUT_MS must be an integer between 1000 and 120000.")
  }
  return { baseUrl: baseUrlValue.replace(/\/+$/, ""), mcpKey, timeoutMs }
}

/**
 * Talks to the Context Compiler web app over HTTP. Configuration problems and network
 * failures surface as thrown errors, which each tool turns into a readable tool error,
 * so the MCP process stays connected even when the app is unreachable.
 */
export function createHttpBackend(
  getConfig: () => RuntimeConfig,
  defaultRepository: string | null = null,
  localChanges?: (repository: RepositoryInfo) => LocalChanges | null
): ToolBackend & {
  session(): Promise<SessionResponse>
} {
  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const config = getConfig()
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.mcpKey}`,
        "Content-Type": "application/json",
        ...(defaultRepository ? { [DEFAULT_REPOSITORY_HEADER]: defaultRepository } : {}),
        ...(init?.headers ?? {}),
      },
      signal: init?.signal ?? AbortSignal.timeout(config.timeoutMs),
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new Error(`Context Compiler did not respond within ${config.timeoutMs}ms. Check CONTEXT_COMPILER_BASE_URL and service availability.`)
      }
      throw new Error(`Could not reach Context Compiler at ${config.baseUrl}. Check the URL, network, and TLS configuration, or run \`bun run mcp:doctor\`.`, { cause: error })
    })

    const text = await response.text()
    let data: T & { error?: string }
    try {
      data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string })
    } catch {
      throw new Error(`Context Compiler returned a non-JSON response (HTTP ${response.status}). Check that the base URL points to the web app, not the AI backend.`)
    }

    if (!response.ok) {
      throw new Error(data.error ?? `Request failed with HTTP ${response.status}`)
    }

    return data as T
  }

  const post = <T>(path: string, body: unknown) =>
    requestJson<T>(path, { method: "POST", body: JSON.stringify(body) })

  return {
    session: () => requestJson<SessionResponse>("/api/mcp/session", { method: "GET" }),
    search: (input) => post<SearchResponse>("/api/mcp/search", input),
    answer: (input) => post<AnswerResponse>("/api/mcp/answer", input),
    contextPack: (input) => post<ContextPackResponse>("/api/mcp/context-pack", input),
    trace: (input) => post<TraceResponse>("/api/mcp/trace", input),
    listRepositories: () => requestJson<RepositoriesResponse>("/api/mcp/repositories", { method: "GET" }),
    ...(localChanges ? { localChanges } : {}),
    file: ({ repository, filePath, startChunkIndex, maxChunks }) => {
      const params = new URLSearchParams({ filePath })
      if (repository) params.set("repository", repository)
      if (typeof startChunkIndex === "number") params.set("startChunkIndex", String(startChunkIndex))
      if (typeof maxChunks === "number") params.set("maxChunks", String(maxChunks))
      return requestJson<FileResponse>(`/api/mcp/file?${params.toString()}`, { method: "GET" })
    },
  }
}

const HELP = `Context Compiler MCP (stdio)

Usage:
  bun run mcp:stdio
  bun run mcp:doctor

Required environment:
  CONTEXT_COMPILER_BASE_URL  Context Compiler web app origin
  CONTEXT_COMPILER_MCP_KEY   Repository or workspace key (ccmcp_...)

Optional environment:
  CONTEXT_COMPILER_TIMEOUT_MS Request timeout, 1000-120000 (default: 60000)
  CONTEXT_COMPILER_REPOSITORY Default owner/name for workspace keys (default: the
                              origin remote of the directory the client starts in)

The server uses MCP stdio; stdout is reserved for protocol messages.
Clients that support remote MCP servers can skip this bridge and connect to
<base-url>/api/mcp directly with an "Authorization: Bearer <key>" header.`

async function main() {
  const command = process.argv[2]
  if (command === "--help" || command === "-h" || command === "help") {
    console.log(HELP)
    return
  }
  if (command && command !== "doctor") {
    throw new Error(`Unknown command: ${command}. Run with --help for usage.`)
  }

  // Configuration is read per request, so a missing variable becomes a tool error the
  // agent can show, instead of a process that exits before the client can connect.
  const checkout = detectLocalCheckout()
  const defaultRepository = checkout?.repository ?? null
  const backend = createHttpBackend(() => loadRuntimeConfig(), defaultRepository, createLocalChangesReader(checkout))

  if (command === "doctor") {
    const session = await backend.session()
    if (session.repository) {
      console.log(`OK: repository key for ${session.repository.fullName}; scan status: ${session.repository.scanStatus.toLowerCase()}`)
    } else {
      console.log(`OK: workspace key for ${session.workspace.name} (${session.repositories.length} repositories)`)
      for (const repository of session.repositories) {
        console.log(`  - ${repository.fullName}: ${repository.scanStatus.toLowerCase()}`)
      }
      console.log(defaultRepository ? `Default repository here: ${defaultRepository}` : "No default repository detected here; tools need `repository`.")
    }
    return
  }

  await startStdioServer(backend, defaultRepository)
}

/** Serves the tools over stdio until the client disconnects or the process is signalled. */
export async function startStdioServer(
  backend: ReturnType<typeof createHttpBackend>,
  defaultRepository: string | null
) {
  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION })
  registerContextCompilerTools(server, backend)

  const transport = new StdioServerTransport()
  await server.connect(transport)
  const shutdown = async () => { await transport.close(); process.exit(0) }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)

  backend
    .session()
    .then((session) => {
      const target = session.repository?.fullName ?? defaultRepository ?? `${session.repositories.length} repositories`
      console.error(`Context Compiler MCP ready for ${target} (${session.workspace.name}).`)
    })
    .catch((error: unknown) => {
      console.error(
        `Context Compiler MCP started, but the first check failed: ${error instanceof Error ? error.message : error}. Tools will report this error until it is fixed.`
      )
    })
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/src/mcp/server.ts")) main().catch((error) => {
  console.error("Context Compiler MCP failed:", error instanceof Error ? error.message : error)
  process.exit(1)
})
