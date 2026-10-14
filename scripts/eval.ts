/**
 * Retrieval eval: asks each dataset's questions through the remote MCP endpoint, exactly
 * as an agent would, and scores whether the expected files come back.
 *
 *   EVAL_BASE_URL=https://your-app bun run eval [--dataset a,b] [--label baseline] [--k 5] [--min-recall 0.85]
 *
 * Keys come from evals/keys.local.json ({ "<dataset name>": "ccmcp_..." }), written by
 * scripts/eval-setup-local.ts or by hand for a deployed instance.
 *
 * Metrics, per question, over the distinct files search_codebase returns, in rank order:
 *   hit@k     at least one expected file is in the top k
 *   recall@k  share of the expected files that are in the top k
 *   MRR       1 / rank of the first expected file (0 if none in the top 10)
 *   pack      share of expected files among build_context_pack's selected files
 *   tokens    estimated tokens (chars / 4) of the context pack text an agent receives
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

type Question = { id: string; kind: string; query: string; expect: string[] }
type Dataset = { name: string; repo: string; commit: string; layout: string; questions: Question[] }
type QuestionResult = {
  id: string
  kind: string
  query: string
  expect: string[]
  ranked: string[]
  hit: number
  recall: number
  rr: number
  packRecall: number
  packTokens: number
  latencyMs: number
  error?: string
}

const ROOT = process.cwd()
const DATASET_DIR = path.join(ROOT, "evals", "datasets")
const KEYS_FILE = path.join(ROOT, "evals", "keys.local.json")
const RESULTS_DIR = path.join(ROOT, "evals", "results")

function argValue(flag: string) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
const pct = (value: number) => `${(value * 100).toFixed(0)}%`

function rankedFiles(structured: Record<string, unknown> | undefined): string[] {
  const groups = (structured?.groups ?? []) as Array<{ filePath: string }>
  return groups.map((group) => group.filePath)
}

function textOf(result: Record<string, unknown>) {
  return ((result.content ?? []) as Array<{ type: string; text?: string }>)
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
}

async function connect(baseUrl: string, key: string) {
  const client = new Client({ name: "context-compiler-eval", version: "1" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/api/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } },
    })
  )
  return client
}

async function evaluate(client: Client, question: Question, k: number): Promise<QuestionResult> {
  const started = performance.now()
  const base = { id: question.id, kind: question.kind, query: question.query, expect: question.expect }
  try {
    const search = await client.callTool({ name: "search_codebase", arguments: { query: question.query, limit: 10 } })
    if (search.isError) throw new Error(textOf(search))
    const ranked = rankedFiles(search.structuredContent as Record<string, unknown> | undefined)
    const latencyMs = performance.now() - started

    const pack = await client.callTool({ name: "build_context_pack", arguments: { task: question.query } })
    if (pack.isError) throw new Error(textOf(pack))
    const packFiles = ((pack.structuredContent as { selectedFiles?: string[] } | undefined)?.selectedFiles ?? [])

    const topK = ranked.slice(0, k)
    const firstRank = ranked.findIndex((file) => question.expect.includes(file))
    return {
      ...base,
      ranked,
      hit: question.expect.some((file) => topK.includes(file)) ? 1 : 0,
      recall: question.expect.filter((file) => topK.includes(file)).length / question.expect.length,
      rr: firstRank >= 0 ? 1 / (firstRank + 1) : 0,
      packRecall: question.expect.filter((file) => packFiles.includes(file)).length / question.expect.length,
      packTokens: Math.ceil(textOf(pack).length / 4),
      latencyMs,
    }
  } catch (error) {
    return {
      ...base,
      ranked: [],
      hit: 0,
      recall: 0,
      rr: 0,
      packRecall: 0,
      packTokens: 0,
      latencyMs: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function summarize(results: QuestionResult[]) {
  return {
    questions: results.length,
    hit: mean(results.map((r) => r.hit)),
    recall: mean(results.map((r) => r.recall)),
    mrr: mean(results.map((r) => r.rr)),
    packRecall: mean(results.map((r) => r.packRecall)),
    packTokens: Math.round(mean(results.map((r) => r.packTokens))),
    latencyMs: Math.round(mean(results.map((r) => r.latencyMs))),
    errors: results.filter((r) => r.error).length,
  }
}

async function main() {
  const baseUrl = (process.env.EVAL_BASE_URL ?? "").replace(/\/+$/, "")
  if (!baseUrl) throw new Error("Set EVAL_BASE_URL to the Context Compiler web app origin.")
  const k = Number(argValue("--k") ?? "5")
  const label = argValue("--label") ?? new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")
  const only = argValue("--dataset")

  const keys = JSON.parse(readFileSync(KEYS_FILE, "utf8")) as Record<string, string>
  const datasets: Dataset[] = readdirSync(DATASET_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(path.join(DATASET_DIR, file), "utf8")) as Dataset)
    .filter((dataset) => !only || only.split(",").includes(dataset.name))

  const report: Array<{ dataset: Dataset; results: QuestionResult[] }> = []
  for (const dataset of datasets) {
    const key = keys[dataset.name]
    if (!key) {
      console.warn(`Skipping ${dataset.name}: no key in evals/keys.local.json`)
      continue
    }
    const client = await connect(baseUrl, key)
    const results: QuestionResult[] = []
    for (const question of dataset.questions) {
      results.push(await evaluate(client, question, k))
    }
    await client.close()
    report.push({ dataset, results })
    const s = summarize(results)
    console.log(`${dataset.name.padEnd(26)} hit@${k} ${pct(s.hit).padStart(4)}  recall@${k} ${pct(s.recall).padStart(4)}  MRR ${s.mrr.toFixed(2)}  pack ${pct(s.packRecall).padStart(4)}  ~${s.packTokens} tok  ${s.latencyMs}ms${s.errors ? `  ${s.errors} errors` : ""}`)
  }

  const all = report.flatMap((entry) => entry.results)
  const overall = summarize(all)
  const datasetMeans = report.map((entry) => summarize(entry.results))
  console.log(`${"overall".padEnd(26)} hit@${k} ${pct(overall.hit).padStart(4)}  recall@${k} ${pct(overall.recall).padStart(4)}  MRR ${overall.mrr.toFixed(2)}  pack ${pct(overall.packRecall).padStart(4)}  ~${overall.packTokens} tok`)
  const worst = Math.min(...datasetMeans.map((s) => s.recall))
  console.log(`Lowest per-repo recall@${k}: ${pct(worst)} (C-grade bar: 70% on every repo)`)
  const minRecall = argValue("--min-recall")

  const lines = [
    `# Retrieval eval: ${label}`,
    "",
    `Base URL: \`${baseUrl}\` · k = ${k} · ${new Date().toISOString()}`,
    "",
    `| Dataset | Layout | Questions | Hit@${k} | Recall@${k} | MRR | Pack recall | Pack tokens | Latency |`,
    "|---|---|---|---|---|---|---|---|---|",
    ...report.map(({ dataset, results }) => {
      const s = summarize(results)
      return `| ${dataset.name} | ${dataset.layout} | ${s.questions} | ${pct(s.hit)} | ${pct(s.recall)} | ${s.mrr.toFixed(2)} | ${pct(s.packRecall)} | ${s.packTokens} | ${s.latencyMs} ms |`
    }),
    `| **overall** | | ${overall.questions} | ${pct(overall.hit)} | ${pct(overall.recall)} | ${overall.mrr.toFixed(2)} | ${pct(overall.packRecall)} | ${overall.packTokens} | ${overall.latencyMs} ms |`,
    "",
    "## By question kind",
    "",
    `| Kind | Questions | Hit@${k} | Recall@${k} | MRR |`,
    "|---|---|---|---|---|",
    ...[...new Set(all.map((r) => r.kind))].map((kind) => {
      const s = summarize(all.filter((r) => r.kind === kind))
      return `| ${kind} | ${s.questions} | ${pct(s.hit)} | ${pct(s.recall)} | ${s.mrr.toFixed(2)} |`
    }),
    "",
    `## Misses (expected file not in the top ${k})`,
    "",
    ...all
      .filter((r) => r.recall < 1)
      .map((r) => `- **${r.id}** "${r.query}" expected ${r.expect.map((f) => `\`${f}\``).join(", ")}; got ${r.error ? `error: ${r.error}` : r.ranked.slice(0, k).map((f) => `\`${f}\``).join(", ") || "nothing"}`),
    "",
  ]

  mkdirSync(RESULTS_DIR, { recursive: true })
  writeFileSync(path.join(RESULTS_DIR, `${label}.md`), lines.join("\n"))
  writeFileSync(path.join(RESULTS_DIR, `${label}.json`), JSON.stringify({ label, baseUrl, k, report }, null, 2) + "\n")
  console.log(`Wrote evals/results/${label}.md`)

  // CI regression gate: fail when any dataset drops below the threshold, or any call errored.
  if (minRecall !== undefined) {
    const threshold = Number(minRecall)
    const failing = report.filter(({ results }) => summarize(results).recall < threshold || results.some((r) => r.error))
    if (report.length === 0 || failing.length > 0) {
      console.error(
        `Recall below ${pct(threshold)} or errors in: ${failing.map(({ dataset }) => dataset.name).join(", ") || "no datasets ran"}`
      )
      process.exit(1)
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
