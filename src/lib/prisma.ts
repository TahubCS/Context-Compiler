import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
  prismaPool?: Pool
}

function getPrismaConnectionString() {
  const connectionString =
    process.env.PRISMA_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.DIRECT_URL

  if (!connectionString) {
    throw new Error("Missing PRISMA_DATABASE_URL, DATABASE_URL, or DIRECT_URL for Prisma.")
  }

  return connectionString
}

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma
  }

  const pool =
    globalForPrisma.prismaPool ??
    new Pool({
      connectionString: getPrismaConnectionString(),
    })

  const client = new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === "development" ? ["warn"] : [],
  })

  // Cached globally in every environment so the lazy client is created once per process
  // (and survives hot reloads in development).
  globalForPrisma.prismaPool = pool
  globalForPrisma.prisma = client
  return client
}

/**
 * The client is created on first use rather than at import, so modules that only
 * import types or pure helpers (and their tests) do not require a database URL.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient()
    const value = Reflect.get(client, property, client)
    return typeof value === "function" ? value.bind(client) : value
  },
})
