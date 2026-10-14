import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

/**
 * The Context Compiler MCP tools, shared by the stdio bridge (src/mcp/server.ts) and the
 * remote Streamable HTTP endpoint (src/app/api/mcp/route.ts). Each transport supplies a
 * backend: the bridge calls the web app over HTTP, the endpoint calls retrieval directly.
 *
 * This module must not import app code (`@/lib/...`) so the bridge can run standalone.
 */

export const MCP_SERVER_NAME = "context-compiler"
export const MCP_SERVER_VERSION = "0.1.0"

export type RepositoryInfo = {
  id: string
  fullName: string
  defaultBranch: string | null
  scanStatus: string
  lastIndexedCommitSha: string | null
  indexFormatVersion: number | null
}

export type SessionResponse = {
  workspace: {
    id: string
    name: string
    slug: string
  }
  repository: RepositoryInfo
  user: {
    id: string
    email: string
  }
}

export type SearchResult = {
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

export type Filters = {
  language?: string
  fileCategory?: string
  pathPrefix?: string
}

export type SearchResponse = {
  repository: RepositoryInfo
  results: SearchResult[]
  bestMatch: SearchResult | null
  declarationSite: SearchResult | null
  relatedFiles: string[]
  omittedDuplicateCount: number
}

export type AnswerResponse = {
  repository: RepositoryInfo
  answer: string
  citations: SearchResult[]
  selectedFiles: string[]
  confidence: "high" | "medium" | "low"
  missingContext: string[]
  needsVerification: boolean
}

export type FileResponse = {
  repository: RepositoryInfo
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
}

export type ContextPackResponse = {
  repository: RepositoryInfo
  pack: string
  snippets: SearchResult[]
  selectedFiles: string[]
  startHereFiles: string[]
  taskSummary: string
  selectionReasons: string[]
  omittedDuplicateCount: number
  mode: string
}

export type TraceResponse = {
  repository: RepositoryInfo
  query: string
  entrypoint: string | null
  orchestrationFiles: string[]
  persistenceFiles: string[]
  integrationFiles: string[]
  readOrder: string[]
  missingLinks: string[]
  supportingResults: SearchResult[]
}

export type TraceMode = "auto" | "feature" | "symbol" | "route"

/** Each method resolves with the response or throws an Error whose message is shown to the agent. */
export type ToolBackend = {
  search(input: Filters & { query: string; limit?: number }): Promise<SearchResponse>
  answer(input: Filters & { question: string; limit?: number }): Promise<AnswerResponse>
  file(input: { filePath: string; startChunkIndex?: number; maxChunks?: number }): Promise<FileResponse>
  contextPack(input: Filters & { task: string; maxSnippets?: number }): Promise<ContextPackResponse>
  trace(input: Filters & { query: string; mode?: TraceMode }): Promise<TraceResponse>
}

export function groupResultsByFile(results: SearchResult[]) {
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

export function errorResult(message: string) {
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

function formatChunkRange(result: SearchResult) {
  return `${result.contextStartChunkIndex ?? result.chunkIndex}-${result.contextEndChunkIndex ?? result.chunkIndex}`
}

const filterSchema = {
  language: z.string().min(1).optional().describe("Only search files in this language, e.g. typescript or python."),
  fileCategory: z.string().min(1).optional().describe("Only search this file category, e.g. source, docs, config, test."),
  pathPrefix: z.string().min(1).optional().describe("Only search under this repository-relative path, e.g. src/auth/."),
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const

export function registerContextCompilerTools(server: McpServer, backend: ToolBackend) {
  server.registerTool(
    "search_codebase",
    {
      description: "Search the bound repository for the best implementation and declaration context.",
      inputSchema: {
        query: z.string().min(1),
        ...filterSchema,
        limit: z.number().int().min(1).max(10).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ query, language, fileCategory, pathPrefix, limit }) => {
      try {
        const data = await backend.search({ query, language, fileCategory, pathPrefix, limit })

        const groups = groupResultsByFile(data.results)
        const lines = [`Repository: ${data.repository.fullName}`, `Query: ${query}`, ""]

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
        ...filterSchema,
        limit: z.number().int().min(1).max(10).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ question, language, fileCategory, pathPrefix, limit }) => {
      try {
        const data = await backend.answer({ question, language, fileCategory, pathPrefix, limit })

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
          .refine((p) => !p.split(/[\\/]/).includes("..") && !p.startsWith("/"), {
            message: "filePath must be a relative path without traversal segments",
          }),
        startChunkIndex: z.number().int().min(0).optional(),
        maxChunks: z.number().int().min(1).max(24).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ filePath, startChunkIndex, maxChunks }) => {
      try {
        const data = await backend.file({ filePath, startChunkIndex, maxChunks })

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
        ...filterSchema,
        maxSnippets: z.number().int().min(1).max(10).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ task, language, fileCategory, pathPrefix, maxSnippets }) => {
      try {
        const data = await backend.contextPack({ task, language, fileCategory, pathPrefix, maxSnippets })

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
        ...filterSchema,
        mode: z.enum(["auto", "feature", "symbol", "route"]).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ query, language, fileCategory, pathPrefix, mode }) => {
      try {
        const data = await backend.trace({ query, language, fileCategory, pathPrefix, mode })

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
}
