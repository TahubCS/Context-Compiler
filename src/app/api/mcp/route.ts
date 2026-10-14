import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import type { ResolvedMcpApiKey } from "@/lib/db"
import {
  runAnswer,
  runContextPack,
  runFileContext,
  runSearch,
  runTrace,
  type McpOperationResult,
} from "@/lib/mcp-operations"
import { authenticateMcpRequest, mcpUnauthorizedResponse } from "@/lib/mcp-request"
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
 * Each request builds a fresh server bound to the key's repository, so no session state
 * lives in memory and the route works on serverless hosts.
 */

export const dynamic = "force-dynamic"

function unwrap<T>(result: McpOperationResult<T>): T {
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.data
}

function createDirectBackend(apiKey: ResolvedMcpApiKey): ToolBackend {
  const repository = apiKey.repository
  return {
    search: async (input) => unwrap(await runSearch(repository, input)),
    answer: async (input) => unwrap(await runAnswer(repository, input)),
    file: async (input) => unwrap(await runFileContext(repository, input)),
    contextPack: async (input) => unwrap(await runContextPack(repository, input)),
    trace: async (input) => unwrap(await runTrace(repository, input)),
  }
}

async function handle(req: Request): Promise<Response> {
  const apiKey = await authenticateMcpRequest(req)
  if (!apiKey) {
    return mcpUnauthorizedResponse()
  }

  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION })
  registerContextCompilerTools(server, createDirectBackend(apiKey))

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
