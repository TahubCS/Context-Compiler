-- Device-style sign-in for the `context-compiler-mcp connect` CLI.
CREATE TABLE IF NOT EXISTS "CliAuthRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "apiKeyId" UUID,
    "decidedBy" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CliAuthRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CliAuthRequest_keyHash_key" ON "CliAuthRequest"("keyHash");
CREATE UNIQUE INDEX IF NOT EXISTS "CliAuthRequest_userCode_key" ON "CliAuthRequest"("userCode");
CREATE INDEX IF NOT EXISTS "CliAuthRequest_expiresAt_idx" ON "CliAuthRequest"("expiresAt");
