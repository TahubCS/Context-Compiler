import { Prisma } from "@prisma/client"
import { prisma } from "./client"

export type CodeDocumentSearchFilters = {
  language?: string | null
  fileCategory?: string | null
  pathPrefix?: string | null
}

export type CodeDocumentSearchResult = {
  id: string
  filePath: string
  chunkIndex: number
  language: string | null
  fileCategory: string | null
  chunkType: string | null
  pathBucket: string | null
  content: string
  score: number
}

const FILE_CONTEXT_CHUNK_SELECT = {
  id: true,
  filePath: true,
  chunkIndex: true,
  language: true,
  fileCategory: true,
  chunkType: true,
  pathBucket: true,
  content: true,
} as const

export type FileContextChunk = Prisma.CodeDocumentGetPayload<{
  select: typeof FILE_CONTEXT_CHUNK_SELECT
}>

function normalizeFilter(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * Cosine similarity search over CodeDocument embeddings.
 * queryVector must be exactly 768 floats (gemini-embedding-001 via MRL reduction).
 * Uses $queryRaw because Prisma cannot query Unsupported field types.
 */
export async function searchCodeDocuments(
  repositoryId: string,
  queryVector: number[],
  filters: CodeDocumentSearchFilters = {},
  limit = 10
): Promise<CodeDocumentSearchResult[]> {
  const vectorLiteral = `[${queryVector.join(",")}]`
  const language = normalizeFilter(filters.language)
  const fileCategory = normalizeFilter(filters.fileCategory)
  const pathPrefix = normalizeFilter(filters.pathPrefix)

  const rows = await prisma.$queryRaw<CodeDocumentSearchResult[]>`
    SELECT
      id,
      "filePath",
      "chunkIndex",
      language,
      "fileCategory",
      "chunkType",
      "pathBucket",
      LEFT(content, 500) AS content,
      (1 - (embedding <=> ${vectorLiteral}::vector))::float8 AS score
    FROM "CodeDocument"
    WHERE "repositoryId" = ${repositoryId}::uuid
      AND embedding IS NOT NULL
      AND (${language}::text IS NULL OR language = ${language})
      AND (${fileCategory}::text IS NULL OR "fileCategory" = ${fileCategory})
      AND (${pathPrefix}::text IS NULL OR "filePath" ILIKE ${pathPrefix + "%"})
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `

  return rows
}

export async function getFileContextChunks(
  repositoryId: string,
  filePath: string,
  options: {
    startChunkIndex?: number | null
    maxChunks?: number | null
  } = {}
): Promise<FileContextChunk[]> {
  const normalizedPath = filePath.trim()
  if (!normalizedPath) {
    return []
  }

  const maxChunks =
    typeof options.maxChunks === "number" && Number.isFinite(options.maxChunks)
      ? Math.max(1, Math.min(Math.trunc(options.maxChunks), 24))
      : 8

  const startChunkIndex =
    typeof options.startChunkIndex === "number" && Number.isFinite(options.startChunkIndex)
      ? Math.max(0, Math.trunc(options.startChunkIndex))
      : null

  return prisma.codeDocument.findMany({
    where: {
      repositoryId,
      filePath: normalizedPath,
      ...(startChunkIndex === null
        ? {}
        : {
            chunkIndex: {
              gte: startChunkIndex,
            },
          }),
    },
    select: FILE_CONTEXT_CHUNK_SELECT,
    orderBy: {
      chunkIndex: "asc",
    },
    take: maxChunks,
  })
}

export async function getFileChunkCount(repositoryId: string, filePath: string): Promise<number> {
  const normalizedPath = filePath.trim()
  if (!normalizedPath) {
    return 0
  }

  return prisma.codeDocument.count({
    where: {
      repositoryId,
      filePath: normalizedPath,
    },
  })
}

/** Character, line and chunk totals per indexed file, for estimating whole-file token counts. */
export async function getIndexedFileSizes(
  repositoryId: string,
  filePaths: string[]
): Promise<Map<string, { chars: number; lines: number; count: number }>> {
  if (filePaths.length === 0) return new Map()
  const rows = await prisma.$queryRaw<Array<{ filePath: string; chars: bigint; lines: bigint; count: bigint }>>`
    SELECT
      "filePath",
      sum(length(content))::bigint AS chars,
      sum(length(content) - length(replace(content, E'\n', '')))::bigint AS lines,
      count(*)::bigint AS count
    FROM "CodeDocument"
    WHERE "repositoryId" = ${repositoryId}::uuid AND "filePath" = ANY(${filePaths})
    GROUP BY "filePath"
  `
  return new Map(
    rows.map((row) => [row.filePath, { chars: Number(row.chars), lines: Number(row.lines), count: Number(row.count) }])
  )
}

/** Every indexed file of a repository with its language. */
export async function listIndexedFiles(repositoryId: string): Promise<Array<{ filePath: string; language: string | null }>> {
  return prisma.codeDocument.findMany({
    where: { repositoryId },
    select: { filePath: true, language: true },
    distinct: ["filePath"],
    orderBy: { filePath: "asc" },
  })
}
