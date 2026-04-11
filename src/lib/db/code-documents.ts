import { prisma } from "./client"

// Hand-written type — Prisma cannot derive types from Unsupported("vector(3072)") fields.
export type CodeDocumentSearchResult = {
  id: string
  filePath: string
  chunkIndex: number
  language: string | null
  content: string
  score: number
}

/**
 * Cosine similarity search over CodeDocument embeddings.
 * queryVector must be exactly 768 floats (gemini-embedding-001 via MRL reduction).
 * Uses $queryRaw because Prisma cannot query Unsupported field types.
 */
export async function searchCodeDocuments(
  repositoryId: string,
  queryVector: number[],
  limit = 10
): Promise<CodeDocumentSearchResult[]> {
  const vectorLiteral = `[${queryVector.join(",")}]`

  const rows = await prisma.$queryRaw<CodeDocumentSearchResult[]>`
    SELECT
      id,
      "filePath",
      "chunkIndex",
      language,
      LEFT(content, 500) AS content,
      (1 - (embedding <=> ${vectorLiteral}::vector))::float8 AS score
    FROM "CodeDocument"
    WHERE "repositoryId" = ${repositoryId}::uuid
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `

  return rows
}
