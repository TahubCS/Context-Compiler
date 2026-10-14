-- Per-call MCP usage log.
CREATE TABLE IF NOT EXISTS "McpToolCall" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "apiKeyId" UUID NOT NULL,
    "repositoryId" UUID,
    "tool" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "resultCount" INTEGER,
    "responseTokens" INTEGER,
    "fullFileTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McpToolCall_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "McpToolCall_apiKeyId_createdAt_idx" ON "McpToolCall"("apiKeyId", "createdAt");
CREATE INDEX IF NOT EXISTS "McpToolCall_repositoryId_createdAt_idx" ON "McpToolCall"("repositoryId", "createdAt");
