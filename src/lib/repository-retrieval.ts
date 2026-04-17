import { getFileContextChunks, type FileContextChunk } from "@/lib/db"
import { formatContextPack } from "@/lib/prompt-packs"
import { getAiBackendUrl } from "@/lib/runtime-urls"

export type RetrievalFilters = {
  language?: string | null
  fileCategory?: string | null
  pathPrefix?: string | null
}

export type RetrievalSearchResult = {
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

export type RetrievalAnswerResult = {
  answer: string
  citations: RetrievalSearchResult[]
}

type RetrievalSuccess<T> = { ok: true; data: T }
type RetrievalFailure = { ok: false; status: number; error: string }

function trimFilter(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

function mapBackendError(response: Response, detail: string | undefined, fallback: string): RetrievalFailure {
  return {
    ok: false,
    status: response.status === 400 ? 400 : 502,
    error: detail ?? fallback,
  }
}

export async function searchRepositoryContext(
  repositoryId: string,
  query: string,
  filters: RetrievalFilters = {},
  limit = 10
): Promise<RetrievalSuccess<RetrievalSearchResult[]> | RetrievalFailure> {
  const backendUrl = getAiBackendUrl()
  if (!backendUrl) {
    return {
      ok: false,
      status: 503,
      error: "AI backend not configured",
    }
  }

  try {
    const response = await fetch(`${backendUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository_id: repositoryId,
        query: query.trim(),
        limit,
        language: trimFilter(filters.language),
        file_category: trimFilter(filters.fileCategory),
        path_prefix: trimFilter(filters.pathPrefix),
      }),
      signal: AbortSignal.timeout(30000),
    })

    const data = await parseJsonSafe<{ results?: RetrievalSearchResult[]; detail?: string }>(response)
    if (!response.ok) {
      return mapBackendError(response, data?.detail, "Search failed.")
    }

    return {
      ok: true,
      data: data?.results ?? [],
    }
  } catch {
    return {
      ok: false,
      status: 503,
      error: "AI backend unreachable",
    }
  }
}

export async function answerRepositoryQuestion(
  repositoryId: string,
  question: string,
  filters: RetrievalFilters = {},
  limit = 6
): Promise<RetrievalSuccess<RetrievalAnswerResult> | RetrievalFailure> {
  const backendUrl = getAiBackendUrl()
  if (!backendUrl) {
    return {
      ok: false,
      status: 503,
      error: "AI backend not configured",
    }
  }

  try {
    const response = await fetch(`${backendUrl}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository_id: repositoryId,
        question: question.trim(),
        limit,
        language: trimFilter(filters.language),
        file_category: trimFilter(filters.fileCategory),
        path_prefix: trimFilter(filters.pathPrefix),
      }),
      signal: AbortSignal.timeout(30000),
    })

    const data = await parseJsonSafe<{
      answer?: string
      citations?: RetrievalSearchResult[]
      detail?: string
    }>(response)

    if (!response.ok) {
      return mapBackendError(response, data?.detail, "Answer generation failed.")
    }

    return {
      ok: true,
      data: {
        answer: data?.answer ?? "",
        citations: data?.citations ?? [],
      },
    }
  } catch {
    return {
      ok: false,
      status: 503,
      error: "AI backend unreachable",
    }
  }
}

export async function getRepositoryFileContext(
  repositoryId: string,
  filePath: string,
  options: {
    startChunkIndex?: number | null
    maxChunks?: number | null
  } = {}
): Promise<{ filePath: string; language: string | null; chunks: FileContextChunk[]; content: string } | null> {
  const chunks = await getFileContextChunks(repositoryId, filePath, options)
  if (chunks.length === 0) {
    return null
  }

  return {
    filePath: chunks[0].filePath,
    language: chunks[0].language,
    chunks,
    content: chunks.map((chunk) => chunk.content).join("\n\n"),
  }
}

export async function buildRepositoryContextPack(
  repositoryId: string,
  repositoryName: string,
  task: string,
  filters: RetrievalFilters = {},
  maxSnippets = 6
): Promise<
  | RetrievalSuccess<{
      pack: string
      snippets: RetrievalSearchResult[]
    }>
  | RetrievalFailure
> {
  const search = await searchRepositoryContext(repositoryId, task, filters, Math.max(1, maxSnippets))
  if (!search.ok) {
    return search
  }

  const snippets = search.data.slice(0, Math.max(1, maxSnippets))
  const pack = formatContextPack(
    repositoryName,
    snippets.map((snippet) => ({
      filePath: snippet.filePath,
      chunkIndex: snippet.primaryChunkIndex ?? snippet.chunkIndex,
      language: snippet.language,
      content: snippet.content,
    })),
    task.trim()
  )

  return {
    ok: true,
    data: {
      pack,
      snippets,
    },
  }
}
