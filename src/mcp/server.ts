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
  priorityTier?: string | null
  selectionReason?: string | null
}

type TraceResponse = {
  repository: SessionResponse["repository"]
  query: string
  entrypoint: string | null
  orchestrationFiles: string[]
  persistenceFiles: string[]
  integrationFiles: string[]
  readOrder: string[]
  missingLinks: string[]
  supportingResults: SearchResult[]
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
let sessionFetchedAt = 0
const SESSION_TTL_MS = 5 * 60 * 1000

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
    const errorMessage =
      (data as { error?: string }).error ?? `Request failed with ${response.status}`
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
  const now = Date.now()
  if (session && now - sessionFetchedAt < SESSION_TTL_MS) {
    return session
  }
  session = await requestJson<SessionResponse>("/api/mcp/session", { method: "GET" })
  sessionFetchedAt = now
  return session
}

function formatChunkRange(result: SearchResult) {
  return `${result.contextStartChunkIndex ?? result.chunkIndex}-${result.contextEndChunkIndex ?? result.chunkIndex}`
}

const server = new McpServer({
  name: "context-compiler",
  version: "0.5.2",
})

server.registerTool(
  "search_codebase",
  {
    description: "Search the bound repository for the best implementation and declaration context.",
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
        bestMatch: SearchResult | null
        declarationSite: SearchResult | null
        relatedFiles: string[]
        omittedDuplicateCount: number
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

      if (data.bestMatch) {
        lines.push("## Best match")
        lines.push(
          `- ${data.bestMatch.filePath} | ${data.bestMatch.matchReason ?? "Semantic match"} | ${formatChunkRange(
            data.bestMatch
          )}`
        )
        if (data.bestMatch.selectionReason) {
          lines.push(`  ${data.bestMatch.selectionReason}`)
        }
        lines.push("")
      }

      if (data.declarationSite && data.declarationSite.filePath !== data.bestMatch?.filePath) {
        lines.push("## Likely declaration site")
        lines.push(`- ${data.declarationSite.filePath} | ${formatChunkRange(data.declarationSite)}`)
        lines.push("")
      }

      if (data.relatedFiles.length > 0) {
        lines.push("## Read next")
        lines.push(...data.relatedFiles.map((filePath) => `- ${filePath}`))
        lines.push("")
      }

      for (const group of groups.slice(0, 5)) {
        lines.push(`## ${group.filePath}`)
        for (const result of group.results) {
          lines.push(
            `- ${result.matchReason ?? "Semantic match"} | ${result.priorityTier ?? "supporting"} | chunks ${formatChunkRange(
              result
            )}`
          )
          if (result.selectionReason) {
            lines.push(`  ${result.selectionReason}`)
          }
        }
        lines.push("")
      }

      if (data.omittedDuplicateCount > 0) {
        lines.push(`Suppressed ${data.omittedDuplicateCount} duplicate or low-priority snippet(s).`)
      }

      return textResult(lines.join("\n"), {
        repository: data.repository,
        query,
        bestMatch: data.bestMatch,
        declarationSite: data.declarationSite,
        relatedFiles: data.relatedFiles,
        groups,
        omittedDuplicateCount: data.omittedDuplicateCount,
      })
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "Search failed.")
    }
  }
)

server.registerTool(
  "answer_repo_question",
  {
    description: "Ask a repository-level question and get a grounded answer with file-first trust signals.",
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
        selectedFiles: string[]
        confidence: "high" | "medium" | "low"
        missingContext: string[]
        needsVerification: boolean
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
        `Confidence: ${data.confidence}`,
      ]

      if (data.selectedFiles.length > 0) {
        lines.push("", "## Files used", ...data.selectedFiles.map((filePath) => `- ${filePath}`))
      }

      if (data.missingContext.length > 0) {
        lines.push("", "## Missing context", ...data.missingContext.map((item) => `- ${item}`))
      }

      lines.push(
        "",
        "## Citations",
        ...data.citations.map(
          (citation) =>
            `- ${citation.filePath} (${formatChunkRange(citation)}) - ${citation.matchReason ?? "Semantic match"}`
        )
      )

      if (data.needsVerification) {
        lines.push("", "Verification recommended before editing.")
      }

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
      filePath: z
        .string()
        .min(1)
        .max(1024)
        .refine((p) => !p.includes("..") && !p.startsWith("/"), {
          message: "filePath must be a relative path without traversal segments",
        }),
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
          fileCategory: string | null
          content: string
          startChunkIndex: number
          endChunkIndex: number
          totalChunkCount: number
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
        `Chunk window: ${data.file.startChunkIndex}-${data.file.endChunkIndex} of ${data.file.totalChunkCount - 1}`,
        data.file.fileCategory ? `Category: ${data.file.fileCategory}` : null,
        "",
        `\`\`\`${language}`,
        data.file.content,
        "```",
      ]
        .filter(Boolean)
        .join("\n")

      return textResult(text, data)
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "File context lookup failed.")
    }
  }
)

server.registerTool(
  "build_context_pack",
  {
    description: "Build a prompt-ready, low-noise working set for a task in the bound repository.",
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
        selectedFiles: string[]
        startHereFiles: string[]
        taskSummary: string
        selectionReasons: string[]
        omittedDuplicateCount: number
        mode: string
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

      const lines = [
        `Repository: ${data.repository.fullName}`,
        `Mode: ${data.mode}`,
        "",
        "## Start here",
        ...data.startHereFiles.map((filePath) => `- ${filePath}`),
      ]

      if (data.selectionReasons.length > 0) {
        lines.push("", "## Why these files", ...data.selectionReasons.map((reason) => `- ${reason}`))
      }

      lines.push("", data.pack)

      if (data.omittedDuplicateCount > 0) {
        lines.push("", `Suppressed ${data.omittedDuplicateCount} duplicate or low-value snippet(s).`)
      }

      return textResult(lines.join("\n"), data)
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "Context pack generation failed.")
    }
  }
)

server.registerTool(
  "trace_feature_flow",
  {
    description: "Trace the likely feature flow through entrypoints, orchestration, persistence, and integrations.",
    inputSchema: {
      query: z.string().min(1),
      language: z.string().optional(),
      fileCategory: z.string().optional(),
      pathPrefix: z.string().optional(),
      mode: z.enum(["auto", "feature", "symbol", "route"]).optional(),
    },
  },
  async ({ query, language, fileCategory, pathPrefix, mode }) => {
    try {
      const data = await requestJson<TraceResponse>("/api/mcp/trace", {
        method: "POST",
        body: JSON.stringify({
          query,
          language,
          fileCategory,
          pathPrefix,
          mode,
        }),
      })

      const lines = [
        `Repository: ${data.repository.fullName}`,
        `Query: ${data.query}`,
        "",
        data.entrypoint ? `Entrypoint: ${data.entrypoint}` : "Entrypoint: not identified",
        "",
        "## Read order",
        ...data.readOrder.map((filePath) => `- ${filePath}`),
      ]

      if (data.orchestrationFiles.length > 0) {
        lines.push("", "## Orchestration", ...data.orchestrationFiles.map((filePath) => `- ${filePath}`))
      }

      if (data.persistenceFiles.length > 0) {
        lines.push("", "## Persistence", ...data.persistenceFiles.map((filePath) => `- ${filePath}`))
      }

      if (data.integrationFiles.length > 0) {
        lines.push("", "## Integration", ...data.integrationFiles.map((filePath) => `- ${filePath}`))
      }

      if (data.missingLinks.length > 0) {
        lines.push("", "## Missing links", ...data.missingLinks.map((item) => `- ${item}`))
      }

      return textResult(lines.join("\n"), data)
    } catch (error) {
      return errorResult(error instanceof Error ? error.message : "Feature trace failed.")
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
