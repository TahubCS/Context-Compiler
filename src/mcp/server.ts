import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  registerContextCompilerTools,
  type AnswerResponse,
  type ContextPackResponse,
  type FileResponse,
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
export function createHttpBackend(getConfig: () => RuntimeConfig): ToolBackend & {
  session(): Promise<SessionResponse>
} {
  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const config = getConfig()
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.mcpKey}`,
        "Content-Type": "application/json",
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
    file: ({ filePath, startChunkIndex, maxChunks }) => {
      const params = new URLSearchParams({ filePath })
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
  CONTEXT_COMPILER_MCP_KEY   Repository-bound key (ccmcp_...)

Optional environment:
  CONTEXT_COMPILER_TIMEOUT_MS Request timeout, 1000-120000 (default: 60000)

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
  const backend = createHttpBackend(() => loadRuntimeConfig())

  if (command === "doctor") {
    const session = await backend.session()
    console.log(`OK: authenticated to ${session.repository.fullName}; scan status: ${session.repository.scanStatus}`)
    return
  }

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
      console.error(`Context Compiler MCP ready for ${session.repository.fullName} (${session.workspace.name}).`)
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
