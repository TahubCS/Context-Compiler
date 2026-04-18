import {
  getFileChunkCount,
  getFileContextChunks,
  type FileContextChunk,
} from "@/lib/db"
import { formatContextPack } from "@/lib/prompt-packs"
import { getAiBackendUrl } from "@/lib/runtime-urls"

export type RetrievalFilters = {
  language?: string | null
  fileCategory?: string | null
  pathPrefix?: string | null
}

export type RetrievalPriorityTier = "primary" | "high" | "supporting" | "deprioritized"
export type RetrievalTraceMode = "auto" | "feature" | "symbol" | "route"
export type RetrievalTaskMode =
  | "architecture"
  | "debug"
  | "migration"
  | "symbol"
  | "task"

export type RetrievalSearchResult = {
  id: string
  filePath: string
  chunkIndex: number
  primaryChunkIndex?: number
  contextStartChunkIndex?: number
  contextEndChunkIndex?: number
  language: string | null
  fileCategory?: string | null
  chunkType?: string | null
  pathBucket?: string | null
  content: string
  score: number
  matchReason?: string | null
  declarationHint?: string | null
  priorityTier?: RetrievalPriorityTier
  selectionReason?: string | null
}

export type RetrievalSearchMetadata = {
  bestMatch: RetrievalSearchResult | null
  declarationSite: RetrievalSearchResult | null
  relatedFiles: string[]
  omittedDuplicateCount: number
}

export type RetrievalAnswerResult = {
  answer: string
  citations: RetrievalSearchResult[]
  selectedFiles: string[]
  confidence: "high" | "medium" | "low"
  missingContext: string[]
  needsVerification: boolean
}

export type RetrievalContextPackResult = {
  pack: string
  snippets: RetrievalSearchResult[]
  selectedFiles: string[]
  startHereFiles: string[]
  taskSummary: string
  selectionReasons: string[]
  omittedDuplicateCount: number
  mode: RetrievalTaskMode
}

export type RetrievalTraceResult = {
  entrypoint: string | null
  orchestrationFiles: string[]
  persistenceFiles: string[]
  integrationFiles: string[]
  readOrder: string[]
  missingLinks: string[]
  supportingResults: RetrievalSearchResult[]
}

type RetrievalSuccess<T> = { ok: true; data: T }
type RetrievalFailure = { ok: false; status: number; error: string }

type AgentSearchSelection = {
  results: RetrievalSearchResult[]
  bestMatch: RetrievalSearchResult | null
  declarationSite: RetrievalSearchResult | null
  relatedFiles: string[]
  selectedFiles: string[]
  omittedDuplicateCount: number
}

type FileRole = "entrypoint" | "orchestration" | "persistence" | "integration" | "supporting"

const SYMBOL_QUERY_RE = /^[A-Za-z_$][\w$]*(?:[.:][A-Za-z_$][\w$]*)*$/
const EXAMPLE_LIKE_RE =
  /(?:^|\/)(?:examples?|demo|sample|fixtures?|mocks?|stories?|storybook|__tests__|tests?|specs?)(?:\/|$)/i
const GENERATED_LIKE_RE =
  /(?:^|\/)(?:dist|build|coverage|generated|vendor|node_modules|\.next)(?:\/|$)/i
const ROUTE_WRAPPER_RE = /(?:^|\/)(?:page|route|layout|loading|template)\.(?:t|j)sx?$/i

function trimFilter(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

function mapBackendError(
  response: Response,
  detail: string | undefined,
  fallback: string
): RetrievalFailure {
  return {
    ok: false,
    status: response.status === 400 ? 400 : 502,
    error: detail ?? fallback,
  }
}

function isSymbolStyleQuery(query: string) {
  return SYMBOL_QUERY_RE.test(query.trim())
}

function inferTaskMode(input: string): RetrievalTaskMode {
  const query = input.trim().toLowerCase()
  if (isSymbolStyleQuery(input)) {
    return "symbol"
  }
  if (/\b(debug|error|trace|broken|failing|failure|exception|bug)\b/.test(query)) {
    return "debug"
  }
  if (/\b(migrate|migration|refactor|rename|replace|upgrade|port)\b/.test(query)) {
    return "migration"
  }
  if (/\b(flow|architecture|how .* work|how .* works|orchestration|pipeline|entrypoint)\b/.test(query)) {
    return "architecture"
  }
  return "task"
}

function classifyFileRole(filePath: string): FileRole {
  if (/(?:^|\/)src\/app\/.+\/(?:page|route|layout)\.(?:t|j)sx?$/i.test(filePath)) {
    return "entrypoint"
  }
  if (/(?:^|\/)src\/lib\/db\//i.test(filePath) || /(?:^|\/)prisma\//i.test(filePath)) {
    return "persistence"
  }
  if (/(?:^|\/)ai-backend\//i.test(filePath) || /github-app|stripe|billing|supabase/i.test(filePath)) {
    return "integration"
  }
  if (/(?:^|\/)src\/lib\//i.test(filePath)) {
    return "orchestration"
  }
  return "supporting"
}

function isExampleLikePath(filePath: string) {
  return EXAMPLE_LIKE_RE.test(filePath)
}

function isGeneratedLikePath(filePath: string) {
  return GENERATED_LIKE_RE.test(filePath)
}

function buildSelectionReason(
  result: RetrievalSearchResult,
  role: FileRole,
  query: string
): string {
  if (result.declarationHint === "high") {
    return "Likely declaration site for this symbol."
  }
  if ((result.matchReason ?? "").toLowerCase().includes("exact symbol")) {
    return "Contains an exact symbol match."
  }
  if (role === "entrypoint") {
    return "Looks like the route or page entrypoint for this behavior."
  }
  if (role === "orchestration") {
    return "Contains shared orchestration logic for this feature."
  }
  if (role === "persistence") {
    return "Contains the data or persistence layer touched by this query."
  }
  if (role === "integration") {
    return "Connects this feature to an external or backend integration."
  }
  if ((result.matchReason ?? "").toLowerCase().includes("path match")) {
    return `Matched the file path for ${query.trim()}.`
  }
  return "Ranked as a supporting implementation match."
}

function scoreResult(result: RetrievalSearchResult, query: string, mode: RetrievalTaskMode) {
  const lowerPath = result.filePath.toLowerCase()
  const role = classifyFileRole(result.filePath)
  let score = result.score * 100

  if (result.declarationHint === "high") {
    score += 110
  }

  switch (result.matchReason) {
    case "Exact symbol":
      score += 95
      break
    case "Likely declaration":
      score += 80
      break
    case "Path match":
      score += 45
      break
    default:
      break
  }

  if (result.fileCategory === "source") {
    score += 28
  }

  if (role === "orchestration") {
    score += mode === "architecture" ? 44 : 24
  }

  if (role === "persistence") {
    score += mode === "debug" || /\b(db|database|query|repository|workspace|persist)/i.test(query)
      ? 32
      : 8
  }

  if (role === "integration") {
    score += mode === "architecture" || mode === "debug" ? 22 : 10
  }

  if (role === "entrypoint") {
    score += mode === "architecture" || mode === "debug" ? 26 : -8
  }

  if (ROUTE_WRAPPER_RE.test(lowerPath) && mode === "symbol") {
    score -= 26
  }

  if (isExampleLikePath(lowerPath)) {
    score -= /\b(example|examples|demo|sample|story|test)\b/i.test(query) ? 10 : 85
  }

  if (isGeneratedLikePath(lowerPath)) {
    score -= 120
  }

  return {
    score,
    role,
  }
}

function priorityTierForScore(score: number): RetrievalPriorityTier {
  if (score >= 180) return "primary"
  if (score >= 125) return "high"
  if (score >= 75) return "supporting"
  return "deprioritized"
}

function dedupeKey(result: RetrievalSearchResult) {
  return [
    result.filePath,
    result.contextStartChunkIndex ?? result.chunkIndex,
    result.contextEndChunkIndex ?? result.chunkIndex,
  ].join(":")
}

function prepareAgentSearchResults(
  rawResults: RetrievalSearchResult[],
  query: string,
  limit: number,
  mode: RetrievalTaskMode = inferTaskMode(query)
): AgentSearchSelection {
  const seen = new Set<string>()
  const perFileCounts = new Map<string, number>()
  let omittedDuplicateCount = 0

  const ranked = rawResults
    .map((result) => {
      const scored = scoreResult(result, query, mode)
      return {
        ...result,
        score: Number(scored.score.toFixed(4)),
        priorityTier: priorityTierForScore(scored.score),
        selectionReason: buildSelectionReason(result, scored.role, query),
        __role: scored.role,
      }
    })
    .sort((left, right) => right.score - left.score)

  const deduped: RetrievalSearchResult[] = []
  for (const result of ranked) {
    const key = dedupeKey(result)
    if (seen.has(key)) {
      omittedDuplicateCount += 1
      continue
    }

    const currentFileCount = perFileCounts.get(result.filePath) ?? 0
    const maxPerFile = mode === "architecture" ? 3 : 2
    if (currentFileCount >= maxPerFile) {
      omittedDuplicateCount += 1
      continue
    }

    seen.add(key)
    perFileCounts.set(result.filePath, currentFileCount + 1)
    deduped.push(result)

    if (deduped.length >= Math.max(limit, 1)) {
      break
    }
  }

  const bestMatch = deduped[0] ?? null
  const declarationSite =
    deduped.find((result) => result.declarationHint === "high") ??
    deduped.find((result) => result.matchReason === "Exact symbol") ??
    null
  const relatedFiles = Array.from(new Set(deduped.map((result) => result.filePath))).slice(0, 6)

  return {
    results: deduped,
    bestMatch,
    declarationSite,
    relatedFiles,
    selectedFiles: relatedFiles,
    omittedDuplicateCount,
  }
}

function computeAnswerConfidence(selection: AgentSearchSelection): "high" | "medium" | "low" {
  if (
    selection.bestMatch &&
    (selection.bestMatch.priorityTier === "primary" || selection.bestMatch.declarationHint === "high") &&
    selection.selectedFiles.length >= 2
  ) {
    return "high"
  }

  if (selection.bestMatch && selection.selectedFiles.length >= 1) {
    return "medium"
  }

  return "low"
}

function computeMissingContext(selection: AgentSearchSelection): string[] {
  const missing: string[] = []
  const hasPersistence = selection.results.some((result) => classifyFileRole(result.filePath) === "persistence")
  const hasIntegration = selection.results.some((result) => classifyFileRole(result.filePath) === "integration")

  if (selection.selectedFiles.length < 2) {
    missing.push("Only a narrow slice of implementation context was retrieved.")
  }

  if (!hasPersistence) {
    missing.push("No persistence-layer file was selected.")
  }

  if (!hasIntegration) {
    missing.push("No backend or external integration file was selected.")
  }

  return missing
}

function buildDeterministicFallbackAnswer(
  question: string,
  selection: AgentSearchSelection
): string {
  const files = selection.selectedFiles.slice(0, 4)
  const best = selection.bestMatch
  const lead = best
    ? `I found relevant implementation context for "${question}" in ${best.filePath}.`
    : `I found some relevant repository context for "${question}".`

  const followUp =
    files.length > 0
      ? ` Review these files first: ${files.join(", ")}.`
      : " The retrieved context is still too thin to give a confident answer."

  return `${lead}${followUp}`
}

function buildTaskSummary(task: string, mode: RetrievalTaskMode) {
  switch (mode) {
    case "symbol":
      return `Resolve the exact implementation or declaration for: ${task.trim()}`
    case "architecture":
      return `Understand how this feature or flow works: ${task.trim()}`
    case "debug":
      return `Debug the behavior or failure described in: ${task.trim()}`
    case "migration":
      return `Find the files most relevant to this refactor or migration: ${task.trim()}`
    default:
      return task.trim()
  }
}

function buildContextPackText(
  repositoryName: string,
  taskSummary: string,
  snippets: RetrievalSearchResult[],
  startHereFiles: string[],
  selectionReasons: string[]
) {
  const sections = snippets.map((snippet) => {
    const language = snippet.language ?? ""
    return [
      `--- FILE: ${snippet.filePath} (chunk ${snippet.primaryChunkIndex ?? snippet.chunkIndex}) ---`,
      `Reason: ${snippet.selectionReason ?? "Selected as relevant context."}`,
      `\`\`\`${language}`,
      snippet.content,
      "```",
    ].join("\n")
  })

  return [
    "# Context Pack",
    `Repository: ${repositoryName}`,
    "",
    "## Task",
    taskSummary,
    "",
    "## Start Here",
    ...startHereFiles.map((filePath) => `- ${filePath}`),
    ...(selectionReasons.length > 0
      ? ["", "## Why These Files", ...selectionReasons.map((reason) => `- ${reason}`)]
      : []),
    "",
    ...sections,
  ].join("\n")
}

function buildTraceResult(selection: AgentSearchSelection): RetrievalTraceResult {
  const entrypoint =
    selection.results.find((result) => classifyFileRole(result.filePath) === "entrypoint")?.filePath ??
    selection.bestMatch?.filePath ??
    null

  const orchestrationFiles = Array.from(
    new Set(
      selection.results
        .filter((result) => classifyFileRole(result.filePath) === "orchestration")
        .map((result) => result.filePath)
    )
  ).slice(0, 4)

  const persistenceFiles = Array.from(
    new Set(
      selection.results
        .filter((result) => classifyFileRole(result.filePath) === "persistence")
        .map((result) => result.filePath)
    )
  ).slice(0, 4)

  const integrationFiles = Array.from(
    new Set(
      selection.results
        .filter((result) => classifyFileRole(result.filePath) === "integration")
        .map((result) => result.filePath)
    )
  ).slice(0, 4)

  const readOrder = [
    ...(entrypoint ? [entrypoint] : []),
    ...orchestrationFiles,
    ...persistenceFiles,
    ...integrationFiles,
  ].filter((value, index, values) => values.indexOf(value) === index)

  const missingLinks: string[] = []
  if (!entrypoint) {
    missingLinks.push("No clear entrypoint was identified.")
  }
  if (orchestrationFiles.length === 0) {
    missingLinks.push("No shared orchestration file was identified.")
  }
  if (persistenceFiles.length === 0) {
    missingLinks.push("No persistence-layer file was identified.")
  }
  if (integrationFiles.length === 0) {
    missingLinks.push("No backend or external integration file was identified.")
  }

  return {
    entrypoint,
    orchestrationFiles,
    persistenceFiles,
    integrationFiles,
    readOrder,
    missingLinks,
    supportingResults: selection.results,
  }
}

export async function searchRepositoryContext(
  repositoryId: string,
  query: string,
  filters: RetrievalFilters = {},
  limit = 10
): Promise<RetrievalSuccess<RetrievalSearchResult[]> | RetrievalFailure> {
  const backendUrl = getAiBackendUrl()
  if (!backendUrl) {
    return {
      ok: false,
      status: 503,
      error: "AI backend not configured",
    }
  }

  try {
    const response = await fetch(`${backendUrl}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository_id: repositoryId,
        query: query.trim(),
        limit,
        language: trimFilter(filters.language),
        file_category: trimFilter(filters.fileCategory),
        path_prefix: trimFilter(filters.pathPrefix),
      }),
      signal: AbortSignal.timeout(30000),
    })

    const data = await parseJsonSafe<{ results?: RetrievalSearchResult[]; detail?: string }>(response)
    if (!response.ok) {
      return mapBackendError(response, data?.detail, "Search failed.")
    }

    return {
      ok: true,
      data: data?.results ?? [],
    }
  } catch {
    return {
      ok: false,
      status: 503,
      error: "AI backend unreachable",
    }
  }
}

export async function searchRepositoryContextForAgent(
  repositoryId: string,
  query: string,
  filters: RetrievalFilters = {},
  limit = 8
): Promise<
  RetrievalSuccess<{
    results: RetrievalSearchResult[]
    metadata: RetrievalSearchMetadata
  }> | RetrievalFailure
> {
  const search = await searchRepositoryContext(repositoryId, query, filters, Math.max(limit * 2, 12))
  if (!search.ok) {
    return search
  }

  const selection = prepareAgentSearchResults(search.data, query, limit)
  return {
    ok: true,
    data: {
      results: selection.results,
      metadata: {
        bestMatch: selection.bestMatch,
        declarationSite: selection.declarationSite,
        relatedFiles: selection.relatedFiles,
        omittedDuplicateCount: selection.omittedDuplicateCount,
      },
    },
  }
}

export async function answerRepositoryQuestion(
  repositoryId: string,
  question: string,
  filters: RetrievalFilters = {},
  limit = 6
): Promise<RetrievalSuccess<RetrievalAnswerResult> | RetrievalFailure> {
  const backendUrl = getAiBackendUrl()
  if (!backendUrl) {
    return {
      ok: false,
      status: 503,
      error: "AI backend not configured",
    }
  }

  const search = await searchRepositoryContext(repositoryId, question, filters, Math.max(limit * 2, 12))
  if (!search.ok) {
    return search
  }

  const selection = prepareAgentSearchResults(search.data, question, Math.max(limit, 4))
  if (!selection.bestMatch) {
    return {
      ok: true,
      data: {
        answer:
          "I could not find relevant indexed context for that question yet. Try scanning the repository first or ask a narrower question.",
        citations: [],
        selectedFiles: [],
        confidence: "low",
        missingContext: ["No relevant indexed context was selected."],
        needsVerification: true,
      },
    }
  }

  const missingContext = computeMissingContext(selection)

  try {
    const response = await fetch(`${backendUrl}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository_id: repositoryId,
        question: question.trim(),
        language: trimFilter(filters.language),
        file_category: trimFilter(filters.fileCategory),
        path_prefix: trimFilter(filters.pathPrefix),
        citations: selection.results.slice(0, Math.max(limit, 4)),
        selected_files: selection.selectedFiles,
      }),
      signal: AbortSignal.timeout(30000),
    })

    const data = await parseJsonSafe<{
      answer?: string
      citations?: RetrievalSearchResult[]
      detail?: string
      degraded?: boolean
    }>(response)

    if (!response.ok) {
      return mapBackendError(response, data?.detail, "Answer generation failed.")
    }

    const answerText =
      data?.answer?.trim() || buildDeterministicFallbackAnswer(question, selection)

    return {
      ok: true,
      data: {
        answer: answerText,
        citations: data?.citations?.length ? data.citations : selection.results.slice(0, Math.max(limit, 4)),
        selectedFiles: selection.selectedFiles,
        confidence: computeAnswerConfidence(selection),
        missingContext,
        needsVerification: missingContext.length > 0 || Boolean(data?.degraded),
      },
    }
  } catch {
    return {
      ok: true,
      data: {
        answer: buildDeterministicFallbackAnswer(question, selection),
        citations: selection.results.slice(0, Math.max(limit, 4)),
        selectedFiles: selection.selectedFiles,
        confidence: computeAnswerConfidence(selection),
        missingContext,
        needsVerification: true,
      },
    }
  }
}

export async function getRepositoryFileContext(
  repositoryId: string,
  filePath: string,
  options: {
    startChunkIndex?: number | null
    maxChunks?: number | null
  } = {}
): Promise<{
  filePath: string
  language: string | null
  fileCategory: string | null
  chunks: FileContextChunk[]
  content: string
  startChunkIndex: number
  endChunkIndex: number
  totalChunkCount: number
} | null> {
  const chunks = await getFileContextChunks(repositoryId, filePath, options)
  if (chunks.length === 0) {
    return null
  }

  const totalChunkCount = await getFileChunkCount(repositoryId, filePath)

  return {
    filePath: chunks[0].filePath,
    language: chunks[0].language,
    fileCategory: chunks[0].fileCategory,
    chunks,
    content: chunks.map((chunk) => chunk.content).join("\n\n"),
    startChunkIndex: chunks[0].chunkIndex,
    endChunkIndex: chunks[chunks.length - 1].chunkIndex,
    totalChunkCount,
  }
}

export async function buildRepositoryContextPack(
  repositoryId: string,
  repositoryName: string,
  task: string,
  filters: RetrievalFilters = {},
  maxSnippets = 6
): Promise<RetrievalSuccess<RetrievalContextPackResult> | RetrievalFailure> {
  const mode = inferTaskMode(task)
  const search = await searchRepositoryContext(repositoryId, task, filters, Math.max(maxSnippets * 2, 12))
  if (!search.ok) {
    return search
  }

  const selection = prepareAgentSearchResults(search.data, task, Math.max(1, maxSnippets), mode)
  const snippets = selection.results.slice(0, Math.max(1, maxSnippets))
  const startHereFiles = Array.from(new Set(snippets.map((snippet) => snippet.filePath))).slice(0, 4)
  const taskSummary = buildTaskSummary(task, mode)
  const selectionReasons = Array.from(
    new Set(snippets.map((snippet) => `${snippet.filePath}: ${snippet.selectionReason ?? "Relevant context."}`))
  )

  const pack =
    snippets.length > 0
      ? buildContextPackText(repositoryName, taskSummary, snippets, startHereFiles, selectionReasons)
      : formatContextPack(repositoryName, [], task.trim())

  return {
    ok: true,
    data: {
      pack,
      snippets,
      selectedFiles: selection.selectedFiles,
      startHereFiles,
      taskSummary,
      selectionReasons,
      omittedDuplicateCount: selection.omittedDuplicateCount,
      mode,
    },
  }
}

export async function traceRepositoryFeatureFlow(
  repositoryId: string,
  query: string,
  filters: RetrievalFilters = {},
  mode: RetrievalTraceMode = "auto"
): Promise<RetrievalSuccess<RetrievalTraceResult> | RetrievalFailure> {
  const inferredMode =
    mode === "auto" ? (isSymbolStyleQuery(query) ? "symbol" : "architecture") : mode === "symbol" ? "symbol" : "architecture"
  const search = await searchRepositoryContext(repositoryId, query, filters, 16)
  if (!search.ok) {
    return search
  }

  const selection = prepareAgentSearchResults(search.data, query, 10, inferredMode)
  return {
    ok: true,
    data: buildTraceResult(selection),
  }
}
