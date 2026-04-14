import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ENCRYPTION_ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

function getGithubTokenEncryptionKey(): Buffer {
  const value = process.env.GITHUB_TOKEN_ENCRYPTION_KEY

  if (!value) {
    throw new Error(
      "Missing GITHUB_TOKEN_ENCRYPTION_KEY. Set a 32-byte secret for GitHub token encryption."
    )
  }

  const normalized = value.trim()
  const keyBuffer = /^[A-Fa-f0-9]{64}$/.test(normalized)
    ? Buffer.from(normalized, "hex")
    : Buffer.from(normalized, "base64")

  if (keyBuffer.length !== 32) {
    throw new Error(
      "GITHUB_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars or base64 for 32 bytes)."
    )
  }

  return keyBuffer
}

export function encryptGithubToken(token: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, getGithubTokenEncryptionKey(), iv)

  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    "."
  )
}

export function decryptGithubToken(payload: string): string {
  const [ivBase64, authTagBase64, ciphertextBase64] = payload.split(".")

  if (!ivBase64 || !authTagBase64 || !ciphertextBase64) {
    throw new Error("Stored GitHub token payload is invalid.")
  }

  const decipher = createDecipheriv(
    ENCRYPTION_ALGORITHM,
    getGithubTokenEncryptionKey(),
    Buffer.from(ivBase64, "base64")
  )

  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"))

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64")),
    decipher.final(),
  ])

  return plaintext.toString("utf8")
}
