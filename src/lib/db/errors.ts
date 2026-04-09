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
