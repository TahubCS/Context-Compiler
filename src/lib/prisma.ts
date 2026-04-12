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

const pool =
  globalForPrisma.prismaPool ??
  new Pool({
    connectionString: getPrismaConnectionString(),
  })

const adapter = new PrismaPg(pool)

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn"] : [],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaPool = pool
  globalForPrisma.prisma = prisma
}
