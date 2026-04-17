import { Prisma } from "@prisma/client"
import { generateMcpApiKey, hashMcpApiKey } from "@/lib/crypto"
import { prisma } from "./client"

const MCP_API_KEY_LIST_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  lastUsedAt: true,
  revokedAt: true,
  createdAt: true,
} as const

const MCP_API_KEY_RESOLVE_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  lastUsedAt: true,
  createdAt: true,
  revokedAt: true,
  user: {
    select: {
      id: true,
      email: true,
    },
  },
  workspace: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  repository: {
    select: {
      id: true,
      fullName: true,
      defaultBranch: true,
      scanStatus: true,
      lastIndexedCommitSha: true,
      indexFormatVersion: true,
    },
  },
} as const

export type McpApiKeyListItem = Prisma.McpApiKeyGetPayload<{
  select: typeof MCP_API_KEY_LIST_SELECT
}>

export type ResolvedMcpApiKey = Prisma.McpApiKeyGetPayload<{
  select: typeof MCP_API_KEY_RESOLVE_SELECT
}>

export async function listMcpApiKeysForRepository(
  repositoryId: string,
  workspaceId: string,
  userId: string
): Promise<McpApiKeyListItem[]> {
  return prisma.mcpApiKey.findMany({
    where: {
      repositoryId,
      workspaceId,
      userId,
    },
    select: MCP_API_KEY_LIST_SELECT,
    orderBy: [{ createdAt: "desc" }],
  })
}

export async function createMcpApiKeyForRepository(
  repositoryId: string,
  workspaceId: string,
  userId: string,
  name: string
): Promise<{ apiKey: McpApiKeyListItem; plaintextKey: string }> {
  const { plaintextKey, keyPrefix } = generateMcpApiKey()
  const keyHash = hashMcpApiKey(plaintextKey)

  const apiKey = await prisma.mcpApiKey.create({
    data: {
      repositoryId,
      workspaceId,
      userId,
      name,
      keyPrefix,
      keyHash,
    },
    select: MCP_API_KEY_LIST_SELECT,
  })

  return { apiKey, plaintextKey }
}

export async function revokeMcpApiKey(
  apiKeyId: string,
  repositoryId: string,
  workspaceId: string,
  userId: string
): Promise<boolean> {
  const result = await prisma.mcpApiKey.updateMany({
    where: {
      id: apiKeyId,
      repositoryId,
      workspaceId,
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  })

  return result.count > 0
}

export async function resolveMcpApiKey(plaintextKey: string): Promise<ResolvedMcpApiKey | null> {
  const keyHash = hashMcpApiKey(plaintextKey)

  const apiKey = await prisma.mcpApiKey.findFirst({
    where: {
      keyHash,
      revokedAt: null,
    },
    select: MCP_API_KEY_RESOLVE_SELECT,
  })

  if (!apiKey) {
    return null
  }

  void prisma.mcpApiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {})

  return apiKey
}
