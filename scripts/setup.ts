/**
 * First-run setup and environment check.
 *
 *   bun run setup
 *
 * Creates .env.local from .env.example with freshly generated secrets if it does not exist,
 * then reports which features the environment enables and what is still missing.
 * Never prints secret values.
 */
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"

const ENV_FILE = ".env.local"

const GENERATED: Record<string, () => string> = {
  AI_CALLBACK_SECRET: () => randomBytes(32).toString("base64url"),
  AI_BACKEND_SECRET: () => randomBytes(32).toString("base64url"),
  GITHUB_APP_WEBHOOK_SECRET: () => randomBytes(32).toString("base64url"),
  GITHUB_TOKEN_ENCRYPTION_KEY: () => randomBytes(32).toString("base64"),
  MCP_API_KEY_SECRET: () => randomBytes(32).toString("base64"),
}

function parseEnv(text: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match) values.set(match[1], match[2].replace(/^(['"])(.*)\1$/, "$2"))
  }
  return values
}

function createEnvFile() {
  const template = readFileSync(".env.example", "utf8")
  const generatedNames: string[] = []
  const output = template
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^([A-Z0-9_]+)=/)
      if (match && GENERATED[match[1]]) {
        generatedNames.push(match[1])
        return `${match[1]}=${GENERATED[match[1]]()}`
      }
      return line
    })
    .join("\n")
  writeFileSync(ENV_FILE, output, { mode: 0o600 })
  console.log(`Created ${ENV_FILE} with generated ${generatedNames.join(", ")}.`)
  console.log("Fill in the Supabase, database, GitHub App and Gemini values, then run this again.\n")
}

const PLACEHOLDER_RE = /your-|replace-with|REPLACE_ME|\.\.\.|example\.com|^$/i

function isSet(env: Map<string, string>, name: string) {
  const value = env.get(name) ?? process.env[name]
  return Boolean(value && !PLACEHOLDER_RE.test(value))
}

function is32ByteSecret(value: string | undefined) {
  if (!value) return false
  const trimmed = value.trim()
  if (/^[A-Fa-f0-9]{64}$/.test(trimmed)) return true
  return Buffer.from(trimmed, "base64").length === 32
}

type Check = { feature: string; required: boolean; missing: string[]; problems: string[] }

function check(env: Map<string, string>): Check[] {
  const get = (name: string) => env.get(name) ?? process.env[name]
  const missing = (names: string[]) => names.filter((name) => !isSet(env, name))
  const checks: Check[] = []

  const web = missing(["NEXT_PUBLIC_URL", "NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL"])
  if (!isSet(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") && !isSet(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    web.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  }
  checks.push({ feature: "Web app and sign-in", required: true, missing: web, problems: [] })

  checks.push({
    feature: "MCP keys",
    required: true,
    missing: missing(["MCP_API_KEY_SECRET"]),
    problems: isSet(env, "MCP_API_KEY_SECRET") && !is32ByteSecret(get("MCP_API_KEY_SECRET"))
      ? ["MCP_API_KEY_SECRET must be 32 bytes (base64 or 64 hex characters)"]
      : [],
  })

  checks.push({
    feature: "Repository import (GitHub App)",
    required: true,
    missing: missing(["GITHUB_APP_ID", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_WEBHOOK_SECRET", "GITHUB_TOKEN_ENCRYPTION_KEY"]),
    problems: isSet(env, "GITHUB_TOKEN_ENCRYPTION_KEY") && !is32ByteSecret(get("GITHUB_TOKEN_ENCRYPTION_KEY"))
      ? ["GITHUB_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 or 64 hex characters)"]
      : [],
  })

  const scanning = missing(["AI_BACKEND_URL", "AI_BACKEND_SECRET", "AI_CALLBACK_SECRET"])
  const embedder = (get("EMBEDDING_PROVIDER") ?? "gemini").toLowerCase()
  if (embedder !== "hash" && !isSet(env, "GOOGLE_GEMINI_API_KEY")) scanning.push("GOOGLE_GEMINI_API_KEY")
  checks.push({
    feature: "Scanning and search (AI backend)",
    required: true,
    missing: scanning,
    problems: isSet(env, "AI_BACKEND_SECRET") && (get("AI_BACKEND_SECRET") ?? "").length < 32
      ? ["AI_BACKEND_SECRET must be at least 32 characters"]
      : [],
  })

  checks.push({
    feature: "Billing (optional)",
    required: false,
    missing: missing(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]),
    problems: [],
  })
  return checks
}

function main() {
  if (!existsSync(ENV_FILE)) {
    createEnvFile()
  }
  const env = parseEnv(readFileSync(ENV_FILE, "utf8"))
  console.log(`Checking ${ENV_FILE} (and the process environment):\n`)

  let blocking = 0
  for (const result of check(env)) {
    const ok = result.missing.length === 0 && result.problems.length === 0
    if (!ok && result.required) blocking += 1
    console.log(`${ok ? "✓" : result.required ? "✗" : "-"} ${result.feature}`)
    if (result.missing.length) console.log(`    missing: ${result.missing.join(", ")}`)
    for (const problem of result.problems) console.log(`    ${problem}`)
  }

  console.log(
    blocking === 0
      ? "\nReady. Next: bun run db:setup, start the AI backend, then bun run dev. GET /api/health checks the running services."
      : `\n${blocking} required area(s) incomplete. The AI backend reads AI_BACKEND_SECRET, DATABASE_URL, GOOGLE_GEMINI_API_KEY and APP_BASE_URL from its own environment.`
  )
}

main()
