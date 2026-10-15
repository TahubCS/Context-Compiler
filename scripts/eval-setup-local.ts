/**
 * Run from the repository root.
 *
 * Prepares a LOCAL Context Compiler stack for the retrieval eval: creates an "Eval" user,
 * workspace and repository row per dataset, scans each repository at its pinned commit,
 * and writes one MCP key per dataset to evals/keys.local.json (gitignored).
 *
 * Only for development databases. Public repositories are cloned anonymously, so no
 * GitHub credentials are needed. Against a real deployment, import the repositories in
 * the UI instead and put their keys in evals/keys.local.json by hand.
 *
 * Required env: DATABASE_URL, MCP_API_KEY_SECRET, AI_BACKEND_URL, AI_BACKEND_SECRET,
 * AI_CALLBACK_SECRET, and EVAL_APP_URL (the running web app, which receives scan callbacks).
 *
 *   bun ./scripts/eval-setup-local.ts [--dataset name] [--rescan]
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { RepositoryScanStatus } from "@prisma/client"
import { createMcpApiKeyForRepository, createScanJob } from "@/lib/db"
import { prisma } from "@/lib/prisma"
import { getAiBackendHeaders, getAiBackendUrl } from "@/lib/runtime-urls"

type Dataset = { name: string; repo: string; commit: string }

const DATASET_DIR = path.join(process.cwd(), "evals", "datasets")
const KEYS_FILE = path.join(process.cwd(), "evals", "keys.local.json")
const EVAL_USER_ID = "00000000-0000-4000-8000-0000000e7a11"
const SCAN_TIMEOUT_MS = 20 * 60 * 1000

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

function argValue(flag: string) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

async function ensureWorkspace() {
  await prisma.user.upsert({
    where: { id: EVAL_USER_ID },
    create: { id: EVAL_USER_ID, email: "eval@context-compiler.local", name: "Eval" },
    update: {},
  })
  return prisma.workspace.upsert({
    where: { slug: "eval" },
    create: { name: "Eval", slug: "eval", ownerUserId: EVAL_USER_ID, type: "PERSONAL" },
    update: {},
  })
}

async function scan(repositoryId: string, dataset: Dataset, appUrl: string) {
  const job = await createScanJob(repositoryId, EVAL_USER_ID)
  const response = await fetch(`${getAiBackendUrl()}/scan`, {
    method: "POST",
    headers: getAiBackendHeaders(),
    body: JSON.stringify({
      scan_job_id: job.id,
      repository_id: repositoryId,
      github_url: `https://github.com/${dataset.repo}`,
      default_branch: "",
      previous_indexed_commit_sha: null,
      repository_index_format_version: null,
      github_token: "",
      callback_url: `${appUrl}/api/repo/${repositoryId}/scan/status`,
      callback_secret: requireEnv("AI_CALLBACK_SECRET"),
      checkout_sha: dataset.commit,
    }),
  })
  if (!response.ok) {
    throw new Error(`AI backend rejected the scan for ${dataset.repo}: HTTP ${response.status} ${await response.text()}`)
  }

  const started = Date.now()
  while (Date.now() - started < SCAN_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const repository = await prisma.repository.findUniqueOrThrow({
      where: { id: repositoryId },
      select: { scanStatus: true, filesProcessed: true, filesDiscovered: true, errorMessage: true },
    })
    if (repository.scanStatus === RepositoryScanStatus.COMPLETED) {
      console.log(`  scanned ${repository.filesProcessed}/${repository.filesDiscovered} files`)
      return
    }
    if (repository.scanStatus === RepositoryScanStatus.FAILED) {
      throw new Error(`Scan failed for ${dataset.repo}: ${repository.errorMessage}`)
    }
  }
  throw new Error(`Scan for ${dataset.repo} did not finish within ${SCAN_TIMEOUT_MS / 60000} minutes.`)
}

async function main() {
  const appUrl = requireEnv("EVAL_APP_URL").replace(/\/+$/, "")
  requireEnv("AI_BACKEND_URL")
  const only = argValue("--dataset")
  const rescan = process.argv.includes("--rescan")

  const datasets: Dataset[] = readdirSync(DATASET_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(readFileSync(path.join(DATASET_DIR, file), "utf8")) as Dataset)
    .filter((dataset) => !only || only.split(",").includes(dataset.name))

  const workspace = await ensureWorkspace()
  let keys: Record<string, string> = {}
  try {
    keys = JSON.parse(readFileSync(KEYS_FILE, "utf8")) as Record<string, string>
  } catch {
    keys = {}
  }

  for (const dataset of datasets) {
    console.log(`${dataset.name} (${dataset.repo} @ ${dataset.commit.slice(0, 7)})`)
    const githubUrl = `https://github.com/${dataset.repo}`
    const repository = await prisma.repository.upsert({
      where: { workspaceId_githubUrl: { workspaceId: workspace.id, githubUrl } },
      create: {
        userId: EVAL_USER_ID,
        workspaceId: workspace.id,
        name: dataset.repo.split("/")[1],
        fullName: dataset.repo,
        owner: dataset.repo.split("/")[0],
        githubUrl,
        defaultBranch: null,
        isPrivate: false,
      },
      update: {},
    })

    const needsScan =
      rescan ||
      repository.scanStatus !== RepositoryScanStatus.COMPLETED ||
      repository.lastIndexedCommitSha !== dataset.commit
    if (needsScan) {
      if (rescan) {
        await prisma.codeDocument.deleteMany({ where: { repositoryId: repository.id } })
        await prisma.repository.update({
          where: { id: repository.id },
          data: { lastIndexedCommitSha: null, indexFormatVersion: 1, activeScanJobId: null },
        })
      }
      await scan(repository.id, dataset, appUrl)
    } else {
      console.log("  already indexed at the pinned commit")
    }

    if (!keys[dataset.name]) {
      const created = await createMcpApiKeyForRepository(repository.id, workspace.id, EVAL_USER_ID, `eval ${dataset.name}`)
      keys[dataset.name] = created.plaintextKey
    }
  }

  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2) + "\n", { mode: 0o600 })
  console.log(`Wrote ${Object.keys(keys).length} key(s) to ${path.relative(process.cwd(), KEYS_FILE)}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
