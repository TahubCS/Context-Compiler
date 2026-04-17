CREATE TABLE "McpApiKey" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "repositoryId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpApiKey_keyHash_key" ON "McpApiKey"("keyHash");
CREATE INDEX "McpApiKey_userId_repositoryId_createdAt_idx" ON "McpApiKey"("userId", "repositoryId", "createdAt");
CREATE INDEX "McpApiKey_workspaceId_repositoryId_createdAt_idx" ON "McpApiKey"("workspaceId", "repositoryId", "createdAt");
CREATE INDEX "McpApiKey_repositoryId_revokedAt_createdAt_idx" ON "McpApiKey"("repositoryId", "revokedAt", "createdAt");

ALTER TABLE "McpApiKey"
ADD CONSTRAINT "McpApiKey_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "McpApiKey"
ADD CONSTRAINT "McpApiKey_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "McpApiKey"
ADD CONSTRAINT "McpApiKey_repositoryId_fkey"
FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
