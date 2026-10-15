/**
 * Makes sure CodeDocument.embedding has an HNSW cosine index.
 *
 * `prisma db push` can only create a btree index for the vector column, and btree rejects
 * 768-dimension vectors, so every embedding insert would fail. Run after `db push`
 * (`bun run db:setup` does both). Safe to run repeatedly.
 *
 * `--extension-only` just enables pgvector, which `db push` needs on a fresh database.
 */
import { Client } from "pg"

const INDEX_NAME = "idx_code_documents_embedding"

async function main() {
  const connectionString =
    process.env.DIRECT_URL ?? process.env.PRISMA_DATABASE_URL ?? process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("Set DIRECT_URL (or DATABASE_URL) to the database to update.")
  }

  const client = new Client({ connectionString })
  await client.connect()
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector")
    if (process.argv.includes("--extension-only")) {
      console.log("pgvector extension is enabled.")
      return
    }
    const existing = await client.query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1",
      [INDEX_NAME]
    )
    const definition = existing.rows[0]?.indexdef ?? ""
    if (/USING hnsw/i.test(definition)) {
      console.log(`${INDEX_NAME} already uses HNSW.`)
      return
    }

    await client.query("BEGIN")
    await client.query(`DROP INDEX IF EXISTS "${INDEX_NAME}"`)
    await client.query(
      `CREATE INDEX "${INDEX_NAME}" ON "CodeDocument" USING hnsw (embedding vector_cosine_ops)`
    )
    await client.query("COMMIT")
    console.log(`${INDEX_NAME} now uses HNSW (was: ${definition || "missing"}).`)
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
