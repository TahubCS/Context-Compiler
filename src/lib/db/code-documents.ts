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
