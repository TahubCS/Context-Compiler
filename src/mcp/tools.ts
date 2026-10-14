import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
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
  lastScannedAt?: string | Date | null
}

/** How the agent's local checkout differs from the indexed commit (stdio bridge only). */
export type LocalChanges = {
  headSha: string
  /** Commits on the checkout since the indexed commit; null if that commit is not available locally. */
  commitsBehind: number | null
  /** Files that differ from the indexed commit, including uncommitted changes. */
  changedFiles: string[]
}

export type SessionResponse = {
  key: { scope: "repository" | "workspace" }
  workspace: {
    id: string
    name: string
    slug: string
  }
  /** Set for repository keys; null for workspace keys. */
  repository: RepositoryInfo | null
  repositories: RepositoryInfo[]
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
  /** owner/name; defaults to the key's repository or the client's default. */
  repository?: string
  language?: string
  fileCategory?: string
  pathPrefix?: string
}

export type RepositoriesResponse = {
  scope: "repository" | "workspace"
  workspace: { id: string; name: string; slug: string }
  repositories: Array<RepositoryInfo & { lastScannedAt?: string | Date | null }>
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
  tokens?: {
    used: number
    budget: number
    fullFiles: number
    omittedForBudget: number
    truncated: boolean
  }
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

export type OverviewResponse = {
  repository: RepositoryInfo
  fileCount: number
  /** Markdown summary of languages, layout, entrypoints, data layer and integrations. */
  text: string
}

export type RescanResponse = {
  repository: RepositoryInfo
  status: "queued" | "up_to_date" | "already_scanning"
  scanJobId?: string
  message: string
}

/** Each method resolves with the response or throws an Error whose message is shown to the agent. */
export type ToolBackend = {
  search(input: Filters & { query: string; limit?: number }): Promise<SearchResponse>
  answer(input: Filters & { question: string; limit?: number }): Promise<AnswerResponse>
  file(input: { repository?: string; filePath: string; startChunkIndex?: number; maxChunks?: number }): Promise<FileResponse>
  contextPack(input: Filters & { task: string; maxSnippets?: number; maxTokens?: number }): Promise<ContextPackResponse>
  trace(input: Filters & { query: string; mode?: TraceMode }): Promise<TraceResponse>
  listRepositories(): Promise<RepositoriesResponse>
  requestRescan(input: { repository?: string }): Promise<RescanResponse>
  overview(input: { repository?: string }): Promise<OverviewResponse>
  /** Optional: compare the indexed commit with the agent's local checkout. */
  localChanges?(repository: RepositoryInfo): LocalChanges | null
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

const repositorySchema = z
  .string()
  .min(1)
  .optional()
  .describe(
    "GitHub owner/name of the repository to use (git remote get-url origin shows it). Needed only with a workspace key that covers several repositories."
  )

const filterSchema = {
  repository: repositorySchema,
  language: z.string().min(1).optional().describe("Only search files in this language, e.g. typescript or python."),
  fileCategory: z.string().min(1).optional().describe("Only search this file category, e.g. source, docs, config, test."),
  pathPrefix: z.string().min(1).optional().describe("Only search under this repository-relative path, e.g. src/auth/."),
}

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const

function age(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const ms = Date.now() - new Date(value).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const minutes = Math.round(ms / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

type Freshness = { lines: string[]; changed: Set<string> }

/**
 * States which commit the answer comes from and, when the backend can see the agent's
 * checkout, which files differ from it, so the agent reads those from disk instead.
 */
function freshness(backend: ToolBackend, repository: RepositoryInfo): Freshness {
  const sha = repository.lastIndexedCommitSha?.slice(0, 7)
  const scanned = age(repository.lastScannedAt)
  const lines = [`Index: ${sha ? `commit ${sha}` : "not indexed yet"}${scanned ? `, scanned ${scanned}` : ""}`]
  const local = sha ? backend.localChanges?.(repository) ?? null : null
  if (!local || local.changedFiles.length === 0) {
    if (local) lines.push("Your checkout matches the index.")
    return { lines, changed: new Set() }
  }
  const commits = local.commitsBehind ? ` (${local.commitsBehind} commit(s) since the indexed one)` : ""
  const shown = local.changedFiles.slice(0, 8).join(", ")
  const more = local.changedFiles.length > 8 ? ` and ${local.changedFiles.length - 8} more` : ""
  lines.push(
    `Your checkout differs from the index in ${local.changedFiles.length} file(s)${commits}: ${shown}${more}. Read those from disk; results marked (changed locally) may be out of date.`
  )
  return { lines, changed: new Set(local.changedFiles) }
}

function mark(filePath: string, fresh: Freshness) {
  return fresh.changed.has(filePath) ? `${filePath} (changed locally)` : filePath
}

export function registerContextCompilerTools(server: McpServer, backend: ToolBackend) {
  server.registerTool(
    "search_codebase",
    {
      description:
        "Find where something is implemented: ranked files and code chunks with the likely declaration site. Use it before opening files when you do not know where code lives. Accepts questions (\"where are JWT tokens validated?\") or identifiers (\"AuthMiddleware\"). Reflects the last indexed commit.",
      inputSchema: {
        query: z.string().min(1),
        ...filterSchema,
        limit: z.number().int().min(1).max(10).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ query, repository, language, fileCategory, pathPrefix, limit }) => {
      try {
        const data = await backend.search({ query, repository, language, fileCategory, pathPrefix, limit })

        const groups = groupResultsByFile(data.results)
        const fresh = freshness(backend, data.repository)
        const lines = [`Repository: ${data.repository.fullName}`, ...fresh.lines, `Query: ${query}`, ""]

        if (data.bestMatch) {
          lines.push("## Best match")
          lines.push(
            `- ${mark(data.bestMatch.filePath, fresh)} | ${data.bestMatch.matchReason ?? "Semantic match"} | ${formatChunkRange(
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
          lines.push(...data.relatedFiles.map((filePath) => `- ${mark(filePath, fresh)}`))
          lines.push("")
        }

        for (const group of groups.slice(0, 5)) {
          lines.push(`## ${mark(group.filePath, fresh)}`)
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

        // Structured results carry locations and reasons, not code: the agent reads code with
        // get_file_context or build_context_pack, so search stays cheap in tokens.
        const withoutContent = (result: SearchResult): Omit<SearchResult, "content"> => {
          const rest: Partial<SearchResult> = { ...result }
          delete rest.content
          return rest as Omit<SearchResult, "content">
        }
        return textResult(lines.join("\n"), {
          repository: data.repository,
          query,
          bestMatch: data.bestMatch ? withoutContent(data.bestMatch) : null,
          declarationSite: data.declarationSite ? withoutContent(data.declarationSite) : null,
          relatedFiles: data.relatedFiles,
          groups: groups.map((group) => ({ filePath: group.filePath, results: group.results.map(withoutContent) })),
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
      description:
        "Explain how something in the repository works, answered from retrieved code with citations and a confidence level. Use for questions like \"how does login work?\"; to find code to edit, prefer search_codebase or build_context_pack. Slower, because it calls a language model.",
      inputSchema: {
        question: z.string().min(1),
        ...filterSchema,
        limit: z.number().int().min(1).max(10).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ question, repository, language, fileCategory, pathPrefix, limit }) => {
      try {
        const data = await backend.answer({ question, repository, language, fileCategory, pathPrefix, limit })

        const fresh = freshness(backend, data.repository)
        const lines = [
          `Repository: ${data.repository.fullName}`,
          ...fresh.lines,
          "",
          "## Answer",
          data.answer,
          "",
          `Confidence: ${data.confidence}`,
        ]

        if (data.selectedFiles.length > 0) {
          lines.push("", "## Files used", ...data.selectedFiles.map((filePath) => `- ${mark(filePath, fresh)}`))
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
      description:
        "Read an indexed file by repository-relative path, whole or as a window of chunks, as of the last indexed commit. Use after search_codebase to read more of a file. If the file changed in your checkout, read it from disk instead.",
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
        repository: repositorySchema,
      },
      annotations: READ_ONLY,
    },
    async ({ filePath, startChunkIndex, maxChunks, repository }) => {
      try {
        const data = await backend.file({ repository, filePath, startChunkIndex, maxChunks })

        const language = data.file.language ?? ""
        const fresh = freshness(backend, data.repository)
        const text = [
          `Repository: ${data.repository.fullName}`,
          ...fresh.lines,
          `File: ${mark(data.file.filePath, fresh)}`,
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
      description:
        "Get the smallest set of code needed for a task, packed into a token budget (default 6000 tokens): ranked snippets, each with why it was chosen. Use at the start of a change in unfamiliar code instead of opening many files.",
      inputSchema: {
        task: z.string().min(1),
        ...filterSchema,
        maxSnippets: z.number().int().min(1).max(10).optional(),
        maxTokens: z
          .number()
          .int()
          .min(500)
          .max(30000)
          .optional()
          .describe("Token budget for the pack (default 6000). The most relevant code is packed first."),
      },
      annotations: READ_ONLY,
    },
    async ({ task, repository, language, fileCategory, pathPrefix, maxSnippets, maxTokens }) => {
      try {
        const data = await backend.contextPack({ task, repository, language, fileCategory, pathPrefix, maxSnippets, maxTokens })

        const fresh = freshness(backend, data.repository)
        const lines = [...fresh.lines]
        if (data.tokens) {
          const saved = data.tokens.fullFiles > data.tokens.used ? `; reading these files in full would be ~${data.tokens.fullFiles}` : ""
          const left = data.tokens.omittedForBudget > 0 ? `, ${data.tokens.omittedForBudget} lower-ranked snippet(s) left out` : ""
          lines.push(`Tokens: ~${data.tokens.used} of ${data.tokens.budget} budget${saved}${left}${data.tokens.truncated ? ", last snippet cut" : ""}.`)
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
      description:
        "Suggest a read order for how a feature flows through the code (entrypoint, logic, data, integrations) and list the links it could not resolve. Use to understand a flow end to end before changing it. Inferred from search results, so verify it.",
      inputSchema: {
        query: z.string().min(1),
        ...filterSchema,
        mode: z.enum(["auto", "feature", "symbol", "route"]).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ query, repository, language, fileCategory, pathPrefix, mode }) => {
      try {
        const data = await backend.trace({ query, repository, language, fileCategory, pathPrefix, mode })

        const fresh = freshness(backend, data.repository)
        const lines = [
          `Repository: ${data.repository.fullName}`,
          ...fresh.lines,
          `Query: ${data.query}`,
          "",
          data.entrypoint ? `Entrypoint: ${mark(data.entrypoint, fresh)}` : "Entrypoint: not identified",
          "",
          "## Read order",
          ...data.readOrder.map((filePath) => `- ${mark(filePath, fresh)}`),
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

  server.registerTool(
    "list_repositories",
    {
      description:
        "List the repositories this key can search, with each one's scan status and indexed commit. Use it to find the `repository` value for other tools.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const data = await backend.listRepositories()
        const lines = [
          `Workspace: ${data.workspace.name} (${data.scope} key)`,
          "",
          ...data.repositories.map(
            (repository) =>
              `- ${repository.fullName}: ${repository.scanStatus.toLowerCase()}${
                repository.lastIndexedCommitSha ? `, indexed at ${repository.lastIndexedCommitSha.slice(0, 7)}` : ", not indexed yet"
              }`
          ),
        ]
        if (data.repositories.length === 0) {
          lines.push("No repositories yet. Import and scan one in Context Compiler.")
        }
        return textResult(lines.join("\n"), data)
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Listing repositories failed.")
      }
    }
  )


  server.registerTool(
    "request_rescan",
    {
      description:
        "Re-index a repository from its default branch when results look out of date (for example, after a merge). Needs a key created with re-scans allowed. The scan runs in the background for a few minutes; list_repositories shows when it completes.",
      inputSchema: { repository: repositorySchema },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ repository }) => {
      try {
        const data = await backend.requestRescan({ repository })
        return textResult(data.message, data)
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : "Could not start a scan.")
      }
    }
  )


  // A map of each repository, readable as a resource (e.g. @-mentioned in Claude Code).
  server.registerResource(
    "repository-overview",
    new ResourceTemplate("context-compiler://{owner}/{name}/overview", {
      list: async () => {
        const { repositories } = await backend.listRepositories()
        return {
          resources: repositories.map((repository) => ({
            uri: `context-compiler://${repository.fullName}/overview`,
            name: `${repository.fullName} overview`,
            description: "Languages, layout, entrypoints, data layer and integrations of the indexed repository.",
            mimeType: "text/markdown",
          })),
        }
      },
    }),
    {
      title: "Repository overview",
      description: "Languages, layout, entrypoints, data layer and integrations of an indexed repository.",
      mimeType: "text/markdown",
    },
    async (uri, variables) => {
      const repository = `${variables.owner}/${variables.name}`
      const data = await backend.overview({ repository })
      return { contents: [{ uri: uri.href, mimeType: "text/markdown", text: data.text }] }
    }
  )

  server.registerPrompt(
    "plan-change",
    {
      title: "Plan a change",
      description: "Gather the right code with Context Compiler, then plan a change before editing.",
      argsSchema: {
        task: z.string().min(1).describe("The change to make"),
        repository: z.string().optional().describe("owner/name, if your key covers several repositories"),
      },
    },
    ({ task, repository }) => {
      const repo = repository ? ` (repository: ${repository})` : ""
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: [
                `Plan this change${repo}: ${task}`,
                "",
                "1. Call build_context_pack with this task to get the most relevant code.",
                "2. If the change crosses layers, call trace_feature_flow to see how the flow connects.",
                "3. Read any file marked (changed locally) from disk rather than trusting the index.",
                "4. Then list the files to change and why, the edits in order, the tests to add or update, and the risks.",
                "Do not edit files until the plan is agreed.",
              ].join("\n"),
            },
          },
        ],
      }
    }
  )

}
