-- Workspace MCP keys: a key with no repository can read every repository in its workspace.
ALTER TABLE "McpApiKey" ALTER COLUMN "repositoryId" DROP NOT NULL;
