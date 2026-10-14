import { listMcpRepositories, type McpRepository, type ResolvedMcpApiKey } from "@/lib/db"
import {
  answerRepositoryQuestion,
  buildRepositoryContextPack,
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
  input: McpFilters & { task?: string; maxSnippets?: number }
) {
  const task = text(input.task)?.trim()
  if (!task) return invalid("task is required")

  const pack = await buildRepositoryContextPack(
    repository.id,
    repository.fullName,
    task,
    filtersFrom(input),
    optionalInteger(input.maxSnippets) ?? 6
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

/** Resolves the call's repository, then runs the operation against it. */
export async function withRepository<T>(
  apiKey: ResolvedMcpApiKey,
  requested: string | null | undefined,
  run: (repository: McpRepository) => Promise<McpOperationResult<T>>
): Promise<McpOperationResult<T>> {
  const resolved = await resolveRepository(apiKey, requested)
  return resolved.ok ? run(resolved.data) : resolved
}
