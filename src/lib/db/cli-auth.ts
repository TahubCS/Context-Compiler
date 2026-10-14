import { randomInt } from "node:crypto"
import { hashMcpApiKey, isWellFormedMcpApiKey } from "@/lib/crypto"
import { prisma } from "./client"

export const CLI_AUTH_TTL_MS = 10 * 60 * 1000

// No 0/O, 1/I/L: the code is read off a terminal and typed or compared by eye.
const USER_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

function generateUserCode(): string {
  const chars = Array.from({ length: 8 }, () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)])
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`
}

export function normalizeUserCode(code: string): string {
  const compact = code.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact
}

export type CliAuthStatus = "pending" | "approved" | "denied" | "expired"

/** Registers a CLI sign-in. The CLI generated `plaintextKey`; only its hash is stored. */
export async function startCliAuthRequest(plaintextKey: string, clientName: string) {
  if (!isWellFormedMcpApiKey(plaintextKey)) {
    throw new Error("The CLI sent a malformed key.")
  }

  // Requests are short-lived; clear out ones that expired more than a day ago.
  await prisma.cliAuthRequest.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.cliAuthRequest.create({
        data: {
          keyHash: hashMcpApiKey(plaintextKey),
          keyPrefix: plaintextKey.slice(0, 18),
          userCode: generateUserCode(),
          clientName: clientName.slice(0, 120),
          expiresAt: new Date(Date.now() + CLI_AUTH_TTL_MS),
        },
        select: { userCode: true, expiresAt: true },
      })
    } catch (error) {
      // Retry only a user-code collision; a reused key is a client bug.
      const target = (error as { meta?: { target?: unknown } }).meta?.target
      if (!String(target ?? "").includes("userCode")) throw error
    }
  }
  throw new Error("Could not allocate a sign-in code. Try again.")
}

export async function getCliAuthStatus(plaintextKey: string): Promise<CliAuthStatus | null> {
  const request = await prisma.cliAuthRequest.findUnique({
    where: { keyHash: hashMcpApiKey(plaintextKey) },
    select: { status: true, expiresAt: true },
  })
  if (!request) return null
  if (request.status === "pending" && request.expiresAt < new Date()) return "expired"
  return request.status as CliAuthStatus
}

export async function getPendingCliAuthRequest(userCode: string) {
  const request = await prisma.cliAuthRequest.findUnique({
    where: { userCode: normalizeUserCode(userCode) },
    select: { userCode: true, clientName: true, keyPrefix: true, status: true, expiresAt: true, createdAt: true },
  })
  if (!request || request.status !== "pending" || request.expiresAt < new Date()) return null
  return request
}

/**
 * Approves or denies a pending request. Approval creates a workspace MCP key with the hash
 * the CLI registered, so the CLI's locally generated key starts working.
 */
export async function decideCliAuthRequest(input: {
  userCode: string
  approve: boolean
  userId: string
  workspaceId: string
}): Promise<{ ok: true; status: "approved" | "denied" } | { ok: false; error: string }> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.cliAuthRequest.findUnique({ where: { userCode: normalizeUserCode(input.userCode) } })
    if (!request || request.status !== "pending" || request.expiresAt < new Date()) {
      return { ok: false as const, error: "This sign-in code is invalid or has expired. Run connect again." }
    }

    if (!input.approve) {
      await tx.cliAuthRequest.update({
        where: { id: request.id },
        data: { status: "denied", decidedBy: input.userId },
      })
      return { ok: true as const, status: "denied" as const }
    }

    const apiKey = await tx.mcpApiKey.create({
      data: {
        userId: input.userId,
        workspaceId: input.workspaceId,
        repositoryId: null,
        name: `CLI: ${request.clientName}`,
        keyPrefix: request.keyPrefix,
        keyHash: request.keyHash,
      },
      select: { id: true },
    })
    await tx.cliAuthRequest.update({
      where: { id: request.id },
      data: { status: "approved", apiKeyId: apiKey.id, decidedBy: input.userId },
    })
    return { ok: true as const, status: "approved" as const }
  })
}
