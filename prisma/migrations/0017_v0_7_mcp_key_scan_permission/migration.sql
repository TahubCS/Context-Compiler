-- Opt-in permission for agents to request a repository re-scan through MCP.
ALTER TABLE "McpApiKey" ADD COLUMN IF NOT EXISTS "canRequestScan" BOOLEAN NOT NULL DEFAULT false;
