import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

type SessionResponse = {
  workspace: {
    id: string
    name: string
    slug: string
  }
  repository: {
    id: string
    fullName: string
    defaultBranch: string | null
    scanStatus: string
    lastIndexedCommitSha: string | null
    indexFormatVersion: number | null
  }
  user: {
    id: string
    email: string
  }
}

type SearchResult = {
  id: string
  filePath: string
  chunkIndex: number
  primaryChunkIndex?: number
  contextStartChunkIndex?: number
  contextEndChunkIndex?: number
  language: string | null
  fileCategory?: string | null
  chunkType?: string | null
  pathBucket?: string | null
  content: string
  score: number
  matchReason?: string | null
  declarationHint?: string | null
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const BASE_URL = requireEnv("CONTEXT_COMPILER_BASE_URL").replace(/\/+$/, "")
const MCP_KEY = requireEnv("CONTEXT_COMPILER_MCP_KEY")

let session: SessionResponse | null = null

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${MCP_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })

  const text = await response.text()
  const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string })

  if (!response.ok) {
    const errorMessage = (data as { error?: string }).error ?? `Request failed with ${response.status}`
    throw new Error(errorMessage)
  }

  return data as T
}

function groupResultsByFile(results: SearchResult[]) {
  const groups = new Map<
    string,
    {
      filePath: string
      results: SearchResult[]
    }
  >()

  for (const result of results) {
    const group = groups.get(result.filePath)
    if (group) {
      group.results.push(result)
      continue
    }

    groups.set(result.filePath, {
      filePath: result.filePath,
      results: [result],
    })
  }

  return Array.from(groups.values())
}

function textResult(text: string, structuredContent?: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
    ...(structuredContent ? { structuredContent } : {}),
  }
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  }
}

async function ensureSession() {
  if (session) {
    return session
  }

  session = await requestJson<SessionResponse>("/api/mcp/session", {
    method: "GET",
  })
  return session
}

const server = new McpServer({
  name: "context-compiler",
  version: "0.5.0",
})

server.registerTool(
  "search_codebase",
  {
    description: "Search the bound repository for relevant code context and likely declaration sites.",
    inputSchema: {
      query: z.string().min(1),
      language: z.string().optional(),
      fileCategory: z.string().optional(),
      pathPrefix: z.string().optional(),
      limit: z.number().int().min(1).max(10).optional(),
    },
  },
  async ({ query, language, fileCategory, pathPrefix, limit }) => {
    try {
      const currentSession = await ensureSession()
      const data = await requestJson<{
        repository: SessionResponse["repository"]
        results: SearchResult[]
      }>("/api/mcp/search", {
        method: "POST",
        body: JSON.stringify({
          query,
          language,
          fileCategory,
          pathPrefix,
          limit,
        }),
      })

      const groups = groupResultsByFile(data.results)
      const lines = [
        `Repository: ${currentSession.repository.fullName}`,
        `Query: ${query}`,
        "",
      ]

      for (const group of groups) {
        lines.push(`## ${group.filePath}`)
        for (const result of group.results) {
          lines.push(
            `- ${result.matchReason ?? "Semantic match"} | score ${result.score.toFixed(3)} | chunks ${
              result.contextStartChunkIndex ?? result.chunkIndex
            }-${result.contextEndChunkIndex ?? result.chunkIndex}`
          )
        }
        lines.push("")
      }

      return textResult(lines.join("\n"), {
        repository: data.repository,
        query,
        groups,
      })
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "Search failed.")
    }
  }
)

server.registerTool(
  "answer_repo_question",
  {
    description: "Ask a repository-level question and get a grounded answer with supporting citations.",
    inputSchema: {
      question: z.string().min(1),
      language: z.string().optional(),
      fileCategory: z.string().optional(),
      pathPrefix: z.string().optional(),
      limit: z.number().int().min(1).max(10).optional(),
    },
  },
  async ({ question, language, fileCategory, pathPrefix, limit }) => {
    try {
      const data = await requestJson<{
        repository: SessionResponse["repository"]
        answer: string
        citations: SearchResult[]
      }>("/api/mcp/answer", {
        method: "POST",
        body: JSON.stringify({
          question,
          language,
          fileCategory,
          pathPrefix,
          limit,
        }),
      })

      const lines = [
        `Repository: ${data.repository.fullName}`,
        "",
        "## Answer",
        data.answer,
        "",
        "## Citations",
        ...data.citations.map(
          (citation) =>
            `- ${citation.filePath} (chunk ${citation.primaryChunkIndex ?? citation.chunkIndex}) - ${
              citation.matchReason ?? "Semantic match"
            }`
        ),
      ]

      return textResult(lines.join("\n"), data)
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "Answer generation failed.")
    }
  }
)

server.registerTool(
  "get_file_context",
  {
    description: "Retrieve stitched indexed context for a specific file path in the bound repository.",
    inputSchema: {
      filePath: z.string().min(1),
      startChunkIndex: z.number().int().min(0).optional(),
      maxChunks: z.number().int().min(1).max(24).optional(),
    },
  },
  async ({ filePath, startChunkIndex, maxChunks }) => {
    try {
      const params = new URLSearchParams({ filePath })
      if (typeof startChunkIndex === "number") {
        params.set("startChunkIndex", String(startChunkIndex))
      }
      if (typeof maxChunks === "number") {
        params.set("maxChunks", String(maxChunks))
      }

      const data = await requestJson<{
        repository: SessionResponse["repository"]
        file: {
          filePath: string
          language: string | null
          content: string
          chunks: Array<{
            chunkIndex: number
            content: string
          }>
        }
      }>(`/api/mcp/file?${params.toString()}`, {
        method: "GET",
      })

      const language = data.file.language ?? ""
      const text = [
        `Repository: ${data.repository.fullName}`,
        `File: ${data.file.filePath}`,
        "",
        `\`\`\`${language}`,
        data.file.content,
        "```",
      ].join("\n")

      return textResult(text, data)
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "File context lookup failed.")
    }
  }
)

server.registerTool(
  "build_context_pack",
  {
    description: "Build a prompt-ready context pack for a task using the best repository snippets.",
    inputSchema: {
      task: z.string().min(1),
      language: z.string().optional(),
      fileCategory: z.string().optional(),
      pathPrefix: z.string().optional(),
      maxSnippets: z.number().int().min(1).max(10).optional(),
    },
  },
  async ({ task, language, fileCategory, pathPrefix, maxSnippets }) => {
    try {
      const data = await requestJson<{
        repository: SessionResponse["repository"]
        pack: string
        snippets: SearchResult[]
      }>("/api/mcp/context-pack", {
        method: "POST",
        body: JSON.stringify({
          task,
          language,
          fileCategory,
          pathPrefix,
          maxSnippets,
        }),
      })

      return textResult(data.pack, data)
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "Context pack generation failed.")
    }
  }
)

async function main() {
  const currentSession = await ensureSession()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(
    `Context Compiler MCP ready for ${currentSession.repository.fullName} (${currentSession.workspace.name}).`
  )
}

main().catch((error) => {
  console.error("Context Compiler MCP failed to start:", error)
  process.exit(1)
})
