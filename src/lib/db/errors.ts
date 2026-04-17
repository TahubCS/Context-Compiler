import { Prisma } from "@prisma/client"

export function isPrismaConnectivityError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()

  return (
    message.includes("tenant or user not found") ||
    message.includes("driveradaptererror") ||
    message.includes("can't reach database server") ||
    message.includes("connection")
  )
}

export function isPrismaMissingTableError(error: unknown, tableName?: string): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
    if (!tableName) return true
    return JSON.stringify(error.meta ?? {}).includes(tableName)
  }

  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  if (!message.includes("does not exist")) {
    return false
  }

  return tableName ? message.includes(tableName.toLowerCase()) : true
}
