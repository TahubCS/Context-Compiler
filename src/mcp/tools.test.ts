import { describe, expect, test } from "bun:test"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import packageJson from "../../package.json"
import { MCP_SERVER_VERSION, registerContextCompilerTools, type SearchResult, type ToolBackend } from "./tools"

const repository = {
  id: "repo-1",
  fullName: "acme/demo",
  defaultBranch: "main",
  scanStatus: "COMPLETED",
  lastIndexedCommitSha: "abc123",
  indexFormatVersion: 2,
}

const result: SearchResult = {
  id: "c1",
  filePath: "src/auth/session.ts",
  chunkIndex: 0,
  language: "typescript",
  content: "export function validateSession() {}",
  score: 0.9,
  matchReason: "Exact symbol",
}

function failing(): never {
  throw new Error("Context Compiler is unreachable")
}

const backend: ToolBackend = {
  search: async () => ({
    repository,
    results: [result],
    bestMatch: result,
    declarationSite: result,
    relatedFiles: [result.filePath],
    omittedDuplicateCount: 0,
  }),
  answer: async () => failing(),
  file: async () => failing(),
  contextPack: async () => failing(),
  trace: async () => failing(),
  requestRescan: async () => failing(),
  overview: async () => ({ repository, fileCount: 2, text: "# acme/demo overview" }),
  listRepositories: async () => ({
    scope: "workspace",
    workspace: { id: "w1", name: "Acme", slug: "acme" },
    repositories: [repository],
  }),
}

async function connect() {
  const server = new McpServer({ name: "test", version: "0" })
  registerContextCompilerTools(server, backend)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  const client = new Client({ name: "test-client", version: "0" })
  await client.connect(clientTransport)
  return client
}

describe("Context Compiler MCP tools", () => {
  test("registers the read-only tools", async () => {
    const client = await connect()
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "answer_repo_question",
      "build_context_pack",
      "get_file_context",
      "list_repositories",
      "request_rescan",
      "search_codebase",
      "trace_feature_flow",
    ])
    // Everything is read-only except request_rescan, which is gated by a key permission.
    expect(tools.filter((tool) => tool.annotations?.readOnlyHint !== true).map((tool) => tool.name)).toEqual(["request_rescan"])
  })

  test("formats search results as text plus structured content", async () => {
    const client = await connect()
    const response = await client.callTool({ name: "search_codebase", arguments: { query: "validateSession" } })
    const text = (response.content as Array<{ text: string }>)[0].text
    expect(response.isError).toBeFalsy()
    expect(text).toContain("Repository: acme/demo")
    expect(text).toContain("## Best match")
    expect(text).toContain("src/auth/session.ts")
    expect(response.structuredContent).toMatchObject({ query: "validateSession", relatedFiles: ["src/auth/session.ts"] })
  })

  test("turns backend failures into tool errors instead of protocol errors", async () => {
    const client = await connect()
    const response = await client.callTool({ name: "answer_repo_question", arguments: { question: "how?" } })
    expect(response.isError).toBe(true)
    expect((response.content as Array<{ text: string }>)[0].text).toBe("Context Compiler is unreachable")
  })

  test("rejects path traversal in get_file_context", async () => {
    const client = await connect()
    const response = await client.callTool({ name: "get_file_context", arguments: { filePath: "../secrets.env" } })
    expect(response.isError).toBe(true)
  })

  test("lists repositories with their index state", async () => {
    const client = await connect()
    const response = await client.callTool({ name: "list_repositories", arguments: {} })
    const text = (response.content as Array<{ text: string }>)[0].text
    expect(text).toContain("Acme (workspace key)")
    expect(text).toContain("acme/demo: completed, indexed at abc123")
  })

  test("serves a repository overview resource and a plan-change prompt", async () => {
    const client = await connect()
    const { resources } = await client.listResources()
    expect(resources.map((resource) => resource.uri)).toEqual(["context-compiler://acme/demo/overview"])
    const read = await client.readResource({ uri: "context-compiler://acme/demo/overview" })
    expect((read.contents[0] as { text: string }).text).toBe("# acme/demo overview")
    const prompt = await client.getPrompt({ name: "plan-change", arguments: { task: "Add rate limits" } })
    expect((prompt.messages[0].content as { text: string }).text).toContain("Plan this change: Add rate limits")
  })

  test("reports the package version", () => {
    expect(MCP_SERVER_VERSION).toBe(packageJson.version)
  })
})
