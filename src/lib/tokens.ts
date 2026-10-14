/**
 * Rough token count for budgeting: about four characters per token for code and English.
 * Close enough to size context for any model; not exact for any tokenizer.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Lines the scanner repeats between consecutive chunks (ai-backend CHUNK_OVERLAP_LINES). */
export const CHUNK_OVERLAP_LINES = 20

/**
 * Estimated tokens of a whole file from its indexed chunks, removing the lines that
 * consecutive chunks share.
 */
export function estimateFileTokens(chunks: { chars: number; lines: number; count: number }): number {
  if (chunks.count <= 1 || chunks.lines <= 0) return Math.ceil(chunks.chars / 4)
  const overlapShare = Math.min(0.9, ((chunks.count - 1) * CHUNK_OVERLAP_LINES) / chunks.lines)
  return Math.ceil((chunks.chars * (1 - overlapShare)) / 4)
}
