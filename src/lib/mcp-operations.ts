import { listIndexedFiles, listMcpRepositories, recordMcpToolCall, type McpRepository, type ResolvedMcpApiKey } from "@/lib/db"
import { classifyFile } from "@/lib/file-roles"
import { dispatchRepositoryScan } from "@/lib/scan-dispatch"
import {
  answerRepositoryQuestion,
  buildRepositoryContextPack,
  DEFAULT_PACK_TOKEN_BUDGET,
  getRepositoryFileContext,
  searchRepositoryContextForAgent,
  traceRepositoryFeatureFlow,
  type RetrievalTraceMode,
} from "@/lib/repository-retrieval"

/**
 * MCP tool operations, shared by the per-tool HTTP routes (used by the stdio bridge)
 * and the remote Streamable HTTP endpoint at /api/mcp.
 */

export type { McpRepository }

export type McpOperationResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export type McpFilters = {
  language?: string | null
  fileCategory?: string | null
  pathPrefix?: string | null
}

const TRACE_MODES: RetrievalTraceMode[] = ["auto", "feature", "symbol", "route"]

function invalid(error: string): { ok: false; status: number; error: string } {
  return { ok: false, status: 400, error }
}

/** Request bodies are untrusted JSON, so read every field defensively. */
function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function filtersFrom(input: McpFilters) {
  return {
    language: text(input.language),
    fileCategory: text(input.fileCategory),
    pathPrefix: text(input.pathPrefix),
  }
}

function optionalInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null
}

/**
 * Normalizes the ways an agent may name a repository ("owner/name", a GitHub URL, or an
 * SSH remote such as git@github.com:owner/name.git) to a lowercase "owner/name".
 */
export function normalizeRepositoryRef(ref: string): string {
  return ref
    .trim()
    .replace(/^git@[^:]+:/i, "")
    .replace(/^(?:https?|ssh|git):\/\/(?:[^@/]+@)?[^/]+\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
}

function repositoryChoices(repositories: McpRepository[]) {
  return repositories.map((repository) => repository.fullName).join(", ")
}

/**
 * Picks the repository a tool call is about. A repository key always uses its own
 * repository; a workspace key uses the requested one (from the tool's `repository`
 * argument or the client's default header), or the only repository in the workspace.
 */
export async function resolveRepository(
  apiKey: ResolvedMcpApiKey,
  requested: string | null | undefined
): Promise<McpOperationResult<McpRepository>> {
  const wanted = requested?.trim() ? normalizeRepositoryRef(requested) : null

  if (apiKey.repository) {
    if (wanted && wanted !== apiKey.repository.fullName.toLowerCase()) {
      return {
        ok: false,
        status: 403,
        error: `This key only covers ${apiKey.repository.fullName}, not ${requested}. Use a workspace key or a key for that repository.`,
      }
    }
    return { ok: true, data: apiKey.repository }
  }

  const repositories = await listMcpRepositories(apiKey)
  if (wanted) {
    const match = repositories.find((repository) => repository.fullName.toLowerCase() === wanted)
    if (match) return { ok: true, data: match }
    return {
      ok: false,
      status: 404,
      error: `${requested} is not in the ${apiKey.workspace.name} workspace. Available: ${repositoryChoices(repositories) || "none yet"}.`,
    }
  }
  if (repositories.length === 1) {
    return { ok: true, data: repositories[0] }
  }
  return {
    ok: false,
    status: 400,
    error:
      repositories.length === 0
        ? `The ${apiKey.workspace.name} workspace has no repositories yet. Import and scan one in Context Compiler first.`
        : `This workspace key covers several repositories, so pass \`repository\` as owner/name (in a checkout, \`git remote get-url origin\` shows it). Available: ${repositoryChoices(repositories)}.`,
  }
}

export async function runListRepositories(apiKey: ResolvedMcpApiKey) {
  const repositories = await listMcpRepositories(apiKey)
  return {
    ok: true as const,
    data: {
      scope: apiKey.repository ? ("repository" as const) : ("workspace" as const),
      workspace: apiKey.workspace,
      repositories,
    },
  }
}

export async function describeSession(apiKey: ResolvedMcpApiKey) {
  return {
    key: {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
      scope: apiKey.repository ? ("repository" as const) : ("workspace" as const),
    },
    workspace: apiKey.workspace,
    repository: apiKey.repository,
    repositories: await listMcpRepositories(apiKey),
    user: apiKey.user,
  }
}

export async function runSearch(
  repository: McpRepository,
  input: McpFilters & { query?: string; limit?: number }
) {
  const query = text(input.query)?.trim()
  if (!query) return invalid("query is required")

  const search = await searchRepositoryContextForAgent(
    repository.id,
    query,
    filtersFrom(input),
    optionalInteger(input.limit) ?? 10
  )
  if (!search.ok) return search

  return {
    ok: true as const,
    data: {
      repository,
      results: search.data.results,
      ...search.data.metadata,
    },
  }
}

export async function runAnswer(
  repository: McpRepository,
  input: McpFilters & { question?: string; limit?: number }
) {
  const question = text(input.question)?.trim()
  if (!question) return invalid("question is required")

  const answer = await answerRepositoryQuestion(
    repository.id,
    question,
    filtersFrom(input),
    optionalInteger(input.limit) ?? 6
  )
  if (!answer.ok) return answer

  return { ok: true as const, data: { repository, ...answer.data } }
}

export async function runFileContext(
  repository: McpRepository,
  input: { filePath?: string; startChunkIndex?: number | null; maxChunks?: number | null }
) {
  const filePath = text(input.filePath)?.trim()
  if (!filePath) return invalid("filePath is required")
  if (filePath.startsWith("/") || filePath.split(/[\\/]/).includes("..")) {
    return invalid("filePath must be a repository-relative path without '..' segments")
  }

  const file = await getRepositoryFileContext(repository.id, filePath, {
    startChunkIndex: optionalInteger(input.startChunkIndex),
    maxChunks: optionalInteger(input.maxChunks),
  })
  if (!file) {
    return {
      ok: false as const,
      status: 404,
      error: `No indexed content for ${filePath}. Check the path, or rescan if the file is new.`,
    }
  }

  return { ok: true as const, data: { repository, file } }
}

export async function runContextPack(
  repository: McpRepository,
  input: McpFilters & { task?: string; maxSnippets?: number; maxTokens?: number }
) {
  const task = text(input.task)?.trim()
  if (!task) return invalid("task is required")

  const pack = await buildRepositoryContextPack(
    repository.id,
    repository.fullName,
    task,
    filtersFrom(input),
    optionalInteger(input.maxSnippets) ?? 6,
    Math.min(Math.max(optionalInteger(input.maxTokens) ?? DEFAULT_PACK_TOKEN_BUDGET, 500), 30000)
  )
  if (!pack.ok) return pack

  return { ok: true as const, data: { repository, ...pack.data } }
}

export async function runTrace(
  repository: McpRepository,
  input: McpFilters & { query?: string; mode?: string }
) {
  const query = text(input.query)?.trim()
  if (!query) return invalid("query is required")

  const mode = (text(input.mode) ?? "auto") as RetrievalTraceMode
  if (!TRACE_MODES.includes(mode)) {
    return invalid(`mode must be one of: ${TRACE_MODES.join(", ")}`)
  }

  const trace = await traceRepositoryFeatureFlow(repository.id, query, filtersFrom(input), mode)
  if (!trace.ok) return trace

  return { ok: true as const, data: { repository, query, ...trace.data } }
}

export type McpToolName =
  | "search_codebase"
  | "answer_repo_question"
  | "get_file_context"
  | "build_context_pack"
  | "trace_feature_flow"
  | "request_rescan"
  | "repository_overview"

/**
 * Result size of a successful call, for the usage log. responseTokens counts the code and
 * prose the tool's text output gives the agent (search and trace list files, not code).
 */
function usageOf(tool: McpToolName, data: unknown) {
  const value = data as Record<string, unknown>
  const count = (items: unknown) => (items as unknown[]).length
  switch (tool) {
    case "search_codebase":
      return { resultCount: count(value.results) }
    case "answer_repo_question":
      return { resultCount: count(value.citations), responseTokens: Math.ceil(String(value.answer ?? "").length / 4) }
    case "get_file_context": {
      const file = value.file as { content: string; chunks: unknown[] }
      return { resultCount: file.chunks.length, responseTokens: Math.ceil(file.content.length / 4) }
    }
    case "build_context_pack": {
      const tokens = value.tokens as { used: number; fullFiles: number }
      return { resultCount: count(value.snippets), responseTokens: tokens.used, fullFileTokens: tokens.fullFiles }
    }
    case "trace_feature_flow":
      return { resultCount: count(value.supportingResults) }
    case "request_rescan":
      return {}
    case "repository_overview":
      return { resultCount: (value.fileCount as number) ?? null, responseTokens: Math.ceil(String(value.text ?? "").length / 4) }
  }
}

/** Resolves the call's repository, runs the operation against it, and logs the call. */
export async function withRepository<T>(
  apiKey: ResolvedMcpApiKey,
  tool: McpToolName,
  requested: string | null | undefined,
  run: (repository: McpRepository) => Promise<McpOperationResult<T>>
): Promise<McpOperationResult<T>> {
  const started = Date.now()
  const resolved = await resolveRepository(apiKey, requested)
  const result = resolved.ok ? await run(resolved.data) : resolved
  let usage: ReturnType<typeof usageOf> | null = null
  if (result.ok) {
    try {
      usage = usageOf(tool, result.data)
    } catch {
      usage = null
    }
  }
  recordMcpToolCall({
    apiKeyId: apiKey.id,
    repositoryId: resolved.ok ? resolved.data.id : null,
    tool,
    ok: result.ok,
    durationMs: Date.now() - started,
    ...usage,
  })
  return result
}

/**
 * Starts a re-scan of the repository's default branch. Only keys created with the scan
 * permission may do this; the scan runs in the background.
 */
export type RescanResult = {
  repository: McpRepository
  status: "queued" | "up_to_date" | "already_scanning"
  scanJobId?: string
  message: string
}

export async function runRequestRescan(
  apiKey: ResolvedMcpApiKey,
  repository: McpRepository,
  appBaseUrl: string
): Promise<McpOperationResult<RescanResult>> {
  if (!apiKey.canRequestScan) {
    return {
      ok: false as const,
      status: 403,
      error:
        "This key cannot start scans. Create a key with \"Let agents request re-scans\" turned on, or start the scan from the repository page.",
    }
  }

  const result = await dispatchRepositoryScan({
    repoId: repository.id,
    workspaceId: apiKey.workspace.id,
    workspaceGitHubInstallationId: apiKey.workspace.githubInstallationId,
    triggeredByUserId: apiKey.user.id,
    appBaseUrl,
  })

  switch (result.status) {
    case "dispatched":
      return {
        ok: true as const,
        data: {
          repository,
          status: "queued",
          scanJobId: result.scanJobId,
          message: `Scan of ${repository.fullName} started. It runs in the background; call list_repositories to see when it completes.`,
        },
      }
    case "up_to_date":
      return {
        ok: true as const,
        data: {
          repository,
          status: "up_to_date",
          message: `${repository.fullName} is already indexed at the latest commit (${result.sha.slice(0, 7)}).`,
        },
      }
    case "already_scanning":
      return {
        ok: true as const,
        data: { repository, status: "already_scanning", message: `A scan of ${repository.fullName} is already running.` },
      }
    case "repo_not_found":
      return { ok: false as const, status: 404, error: "Repository not found." }
    case "credential_missing":
      return { ok: false as const, status: 400, error: result.error }
    case "backend_unavailable":
      return { ok: false as const, status: 503, error: result.error }
  }
}

// Folders that hold several projects; the overview groups by their second level.
const MONOREPO_ROOTS = new Set(["packages", "apps", "services", "libs", "modules", "internal", "cmd", "crates", "projects"])

function topDirectory(filePath: string): string {
  const parts = filePath.split("/")
  if (parts.length === 1) return "(root)"
  return MONOREPO_ROOTS.has(parts[0]) && parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0]
}

function countBy<T>(items: T[], key: (item: T) => string | null) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const value = key(item)
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

/**
 * A map of the repository for an agent starting work in it: languages, layout, and the
 * files that look like entrypoints, data layer and integrations. Built from the index.
 */
export async function runRepositoryOverview(repository: McpRepository) {
  const files = await listIndexedFiles(repository.id)
  const classified = files.map((file) => ({ ...file, ...classifyFile(file.filePath) }))
  const source = classified.filter((file) => file.kind === "source")
  const pick = (role: string, limit = 12) =>
    source
      .filter((file) => file.role === role)
      .map((file) => file.filePath)
      // Barrel files (index.ts) re-export rather than handle requests, so list them last.
      .sort(
        (a, b) =>
          Number(/(?:^|\/)index\.[a-z]+$/.test(a)) - Number(/(?:^|\/)index\.[a-z]+$/.test(b)) ||
          a.split("/").length - b.split("/").length ||
          a.localeCompare(b)
      )
      .slice(0, limit)

  const languages = countBy(classified, (file) => file.language).slice(0, 8)
  const directories = countBy(classified, (file) => topDirectory(file.filePath)).slice(0, 12)
  const entrypoints = pick("entrypoint")
  const persistence = pick("persistence")
  const integrations = pick("integration", 8)
  const docs = classified
    .filter((file) => /(?:^|\/)(?:readme|agents|claude|contributing)(?:\.[^/]*)?$/i.test(file.filePath))
    .map((file) => file.filePath)
    .slice(0, 6)

  const list = (items: string[]) => (items.length ? items.map((item) => `- ${item}`) : ["- none found"])
  const text = [
    `# ${repository.fullName}`,
    "",
    `${files.length} indexed files at commit ${repository.lastIndexedCommitSha?.slice(0, 7) ?? "(not indexed)"}${
      repository.defaultBranch ? ` on ${repository.defaultBranch}` : ""
    }.`,
    "",
    "## Languages",
    ...languages.map(([language, count]) => `- ${language}: ${count} files`),
    "",
    "## Layout",
    ...directories.map(([directory, count]) => `- ${directory}/: ${count} files`),
    "",
    "## Likely entrypoints (routes, handlers, controllers, main)",
    ...list(entrypoints),
    "",
    "## Data layer (models, schemas, repositories)",
    ...list(persistence),
    "",
    "## Integrations (external services and clients)",
    ...list(integrations),
    "",
    "## Guides",
    ...list(docs),
    "",
    "Inferred from file paths. Use search_codebase or build_context_pack for a specific task.",
  ].join("\n")

  return {
    ok: true as const,
    data: { repository, fileCount: files.length, languages, directories, entrypoints, persistence, integrations, docs, text },
  }
}
