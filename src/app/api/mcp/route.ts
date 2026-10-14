import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import type { ResolvedMcpApiKey } from "@/lib/db"
import {
  runAnswer,
  runContextPack,
  runFileContext,
  runListRepositories,
  runSearch,
  runTrace,
  withRepository,
  type McpOperationResult,
} from "@/lib/mcp-operations"
import { authenticateMcpRequest, DEFAULT_REPOSITORY_HEADER, mcpUnauthorizedResponse } from "@/lib/mcp-request"
import {
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  registerContextCompilerTools,
  type ToolBackend,
} from "@/mcp/tools"

/**
 * Remote MCP endpoint (Streamable HTTP, stateless, JSON responses).
 *
 *   claude mcp add --transport http context-compiler https://<app>/api/mcp \
 *     --header "Authorization: Bearer ccmcp_..."
 *
 * A workspace key picks the repository per call from the tool's `repository` argument,
 * falling back to an optional X-Context-Compiler-Repository header (a per-project default).
 *
 * Each request builds a fresh server, so no session state lives in memory and the route
 * works on serverless hosts.
 */

export const dynamic = "force-dynamic"

function unwrap<T>(result: McpOperationResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.data
}

function createDirectBackend(apiKey: ResolvedMcpApiKey, defaultRepository: string | null): ToolBackend {
  const scope = (requested: string | undefined) => requested ?? defaultRepository
  return {
    search: async (input) =>
      unwrap(await withRepository(apiKey, scope(input.repository), (repository) => runSearch(repository, input))),
    answer: async (input) =>
      unwrap(await withRepository(apiKey, scope(input.repository), (repository) => runAnswer(repository, input))),
    file: async (input) =>
      unwrap(await withRepository(apiKey, scope(input.repository), (repository) => runFileContext(repository, input))),
    contextPack: async (input) =>
      unwrap(await withRepository(apiKey, scope(input.repository), (repository) => runContextPack(repository, input))),
    trace: async (input) =>
      unwrap(await withRepository(apiKey, scope(input.repository), (repository) => runTrace(repository, input))),
    listRepositories: async () => unwrap(await runListRepositories(apiKey)),
  }
}

async function handle(req: Request): Promise<Response> {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return mcpUnauthorizedResponse()
  }

  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION })
  registerContextCompilerTools(server, createDirectBackend(apiKey, req.headers.get(DEFAULT_REPOSITORY_HEADER)))

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)

  try {
    return await transport.handleRequest(req)
  } finally {
    // With JSON responses the reply is complete once handleRequest resolves.
    await server.close().catch(() => {})
  }
}

export const POST = handle
export const GET = handle
export const DELETE = handle
