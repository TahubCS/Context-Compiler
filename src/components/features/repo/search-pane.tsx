"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bookmark,
  Copy,
  Loader2,
  MessageSquare,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react"
import { AnswerRichText } from "@/components/features/repo/answer-rich-text"
import {
  RetrievalResultCard,
  type RetrievalResultCardData,
} from "@/components/features/repo/retrieval-result-card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { formatAnswerPack } from "@/lib/prompt-packs"
import { useContextCart, type CartItem } from "@/store/context-cart"
import { toast } from "sonner"

type SearchResult = RetrievalResultCardData

type AnswerResult = {
  question: string
  answer: string
  citations: SearchResult[]
}

type SavedAnswerSummary = {
  id: string
  question: string
  status: string
  updatedAt: string
  _count: {
    citations: number
  }
}

type SearchPaneProps = {
  repoId: string
  repositoryName: string
  indexOutdated: boolean
}

type RetrievalFilters = {
  language: string
  fileCategory: string
  pathPrefix: string
}

const DEFAULT_FILTERS: RetrievalFilters = {
  language: "all",
  fileCategory: "all",
  pathPrefix: "",
}

export function SearchPane({ repoId, repositoryName, indexOutdated }: SearchPaneProps) {
  const [activeTab, setActiveTab] = useState("ask")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [question, setQuestion] = useState("")
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null)
  const [isAnswering, setIsAnswering] = useState(false)
  const [savedAnswerId, setSavedAnswerId] = useState<string | null>(null)
  const [savedAnswers, setSavedAnswers] = useState<SavedAnswerSummary[]>([])
  const [isLoadingSavedAnswers, setIsLoadingSavedAnswers] = useState(true)
  const [activeSavedAnswerId, setActiveSavedAnswerId] = useState<string | null>(null)
  const [filters, setFilters] = useState<RetrievalFilters>(DEFAULT_FILTERS)
  const { add, has } = useContextCart()

  const activeFilterBadges = useMemo(() => {
    return [
      filters.language !== "all" ? `Language: ${filters.language}` : null,
      filters.fileCategory !== "all" ? `Category: ${filters.fileCategory}` : null,
      filters.pathPrefix.trim() ? `Path: ${filters.pathPrefix.trim()}` : null,
    ].filter(Boolean) as string[]
  }, [filters])

  const groupedResults = useMemo(() => groupSearchResults(results), [results])
  const topCitationFiles = useMemo(
    () => getTopCitationFiles(answerResult?.citations ?? []),
    [answerResult]
  )
  const symbolStyleQuery = useMemo(() => isSymbolStyleQuery(query), [query])

  const loadSavedAnswers = useCallback(async () => {
    setIsLoadingSavedAnswers(true)
    try {
      const res = await fetch(`/api/repo/${repoId}/answers`)
      const data = (await res.json()) as { answers?: SavedAnswerSummary[]; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load saved answers.")
        return
      }
      setSavedAnswers(data.answers ?? [])
    } catch {
      toast.error("Could not load saved answers.")
    } finally {
      setIsLoadingSavedAnswers(false)
    }
  }, [repoId])

  useEffect(() => {
    void loadSavedAnswers()
  }, [repoId, loadSavedAnswers])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return

    setIsSearching(true)
    try {
      const res = await fetch(`/api/repo/${repoId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmedQuery,
          language: filters.language === "all" ? null : filters.language,
          fileCategory: filters.fileCategory === "all" ? null : filters.fileCategory,
          pathPrefix: filters.pathPrefix.trim() || null,
        }),
      })
      const data = (await res.json()) as { results?: SearchResult[]; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Search failed.")
        return
      }
      setResults(data.results ?? [])
      setHasSearched(true)
    } catch {
      toast.error("Could not reach the server.")
    } finally {
      setIsSearching(false)
    }
  }

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault()
    const trimmedQuestion = question.trim()
    if (!trimmedQuestion) return

    setIsAnswering(true)
    setSavedAnswerId(null)
    try {
      const res = await fetch(`/api/repo/${repoId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmedQuestion,
          language: filters.language === "all" ? null : filters.language,
          fileCategory: filters.fileCategory === "all" ? null : filters.fileCategory,
          pathPrefix: filters.pathPrefix.trim() || null,
        }),
      })
      const data = (await res.json()) as {
        answer?: string
        citations?: SearchResult[]
        error?: string
      }
      if (!res.ok) {
        toast.error(data.error ?? "Answer generation failed.")
        return
      }

      setAnswerResult({
        question: trimmedQuestion,
        answer: data.answer ?? "",
        citations: data.citations ?? [],
      })
      setActiveTab("ask")
      setActiveSavedAnswerId(null)
    } catch {
      toast.error("Could not reach the AI service.")
    } finally {
      setIsAnswering(false)
    }
  }

  function addToCart(result: SearchResult) {
    const item: CartItem = {
      ...result,
      repositoryId: repoId,
      score: result.score ?? 0,
    }
    add(item)
  }

  async function copySnippet(result: SearchResult) {
    try {
      await navigator.clipboard.writeText(result.content)
      toast.success("Snippet copied to clipboard.")
    } catch {
      toast.error("Could not copy snippet.")
    }
  }

  function addAllCitationsToCart() {
    if (!answerResult) return
    answerResult.citations.forEach((citation) => addToCart(citation))
    toast.success("Answer citations added to the context cart.")
  }

  async function saveAnswer() {
    if (!answerResult || savedAnswerId) return

    try {
      const res = await fetch(`/api/repo/${repoId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answerResult),
      })

      const data = (await res.json()) as {
        answerSession?: { id: string }
        error?: string
      }

      if (!res.ok) {
        toast.error(data.error ?? "Failed to save answer.")
        return
      }

      setSavedAnswerId(data.answerSession?.id ?? null)
      await loadSavedAnswers()
      toast.success("Answer saved.")
    } catch {
      toast.error("Could not save answer.")
    }
  }

  async function loadSavedAnswer(answerId: string) {
    setActiveSavedAnswerId(answerId)
    try {
      const res = await fetch(`/api/repo/${repoId}/answers/${answerId}`)
      const data = (await res.json()) as {
        answerSession?: {
          id: string
          question: string
          answer: string
          citations: Array<{
            codeDocumentId: string | null
            filePath: string
            chunkIndex: number
            language: string | null
            fileCategory?: string | null
            chunkType?: string | null
            pathBucket?: string | null
            contentSnapshot: string
            score: number | null
          }>
        }
        error?: string
      }

      if (!res.ok || !data.answerSession) {
        toast.error(data.error ?? "Failed to load saved answer.")
        return
      }

      const session = data.answerSession
      setQuestion(session.question)
      setAnswerResult({
        question: session.question,
        answer: session.answer,
        citations: session.citations.map((citation) => ({
          id: citation.codeDocumentId ?? `${session.id}-${citation.filePath}-${citation.chunkIndex}`,
          filePath: citation.filePath,
          chunkIndex: citation.chunkIndex,
          language: citation.language,
          fileCategory: citation.fileCategory ?? null,
          chunkType: citation.chunkType ?? null,
          pathBucket: citation.pathBucket ?? null,
          content: citation.contentSnapshot,
          score: citation.score ?? 0,
        })),
      })
      setSavedAnswerId(session.id)
      setActiveTab("ask")
      toast.success("Saved answer loaded.")
    } catch {
      toast.error("Could not load saved answer.")
    } finally {
      setActiveSavedAnswerId(null)
    }
  }

  async function copySavedAnswerPack(answerId: string) {
    try {
      const res = await fetch(`/api/repo/${repoId}/answers/${answerId}/export`)
      const text = await res.text()
      if (!res.ok) {
        toast.error(text || "Failed to export answer pack.")
        return
      }
      await navigator.clipboard.writeText(text)
      toast.success("Answer pack copied to clipboard.")
    } catch {
      toast.error("Could not export answer pack.")
    }
  }

  async function deleteSavedAnswer(answerId: string) {
    try {
      const res = await fetch(`/api/repo/${repoId}/answers/${answerId}`, {
        method: "DELETE",
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete saved answer.")
        return
      }

      if (savedAnswerId === answerId) {
        setSavedAnswerId(null)
      }

      await loadSavedAnswers()
      toast.success("Saved answer deleted.")
    } catch {
      toast.error("Could not delete saved answer.")
    }
  }

  async function copyCurrentAnswerPack() {
    if (!answerResult) return

    const text = formatAnswerPack(
      repositoryName,
      answerResult.question,
      answerResult.answer,
      answerResult.citations.map((citation) => ({
        filePath: citation.filePath,
        chunkIndex: citation.chunkIndex,
        language: citation.language,
        content: citation.content,
      }))
    )

    try {
      await navigator.clipboard.writeText(text)
      toast.success("Answer pack copied to clipboard.")
    } catch {
      toast.error("Could not copy answer pack.")
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {indexOutdated ? (
        <Alert>
          <AlertDescription>
            This repository was indexed before the `V1.4` retrieval upgrade. Re-scan it to unlock
            overlap-based chunking and shared retrieval filters.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card size="sm" className="rounded-2xl border border-border bg-background/70 shadow-none">
        <CardHeader className="gap-2 border-b border-border/70">
          <Badge variant="secondary" className="w-fit">
            Ask-first workflow
          </Badge>
          <CardTitle className="text-lg">Ask this repository, then inspect the evidence</CardTitle>
          <CardDescription>
            Start with a repo-level question, review the grounded answer, then inspect and collect
            the exact code context you want to export.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap gap-2">
            <Select
              value={filters.language}
              onValueChange={(value) => setFilters((current) => ({ ...current, language: value }))}
            >
              <SelectTrigger size="sm" className="w-[160px]">
                <SelectValue placeholder="Language" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All languages</SelectItem>
                <SelectItem value="typescript">TypeScript</SelectItem>
                <SelectItem value="javascript">JavaScript</SelectItem>
                <SelectItem value="python">Python</SelectItem>
                <SelectItem value="go">Go</SelectItem>
                <SelectItem value="rust">Rust</SelectItem>
                <SelectItem value="markdown">Markdown</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
                <SelectItem value="sql">SQL</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.fileCategory}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, fileCategory: value }))
              }
            >
              <SelectTrigger size="sm" className="w-[170px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="source">Source</SelectItem>
                <SelectItem value="tests">Tests</SelectItem>
                <SelectItem value="docs">Docs</SelectItem>
                <SelectItem value="config">Config</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>

            <Input
              value={filters.pathPrefix}
              onChange={(event) =>
                setFilters((current) => ({ ...current, pathPrefix: event.target.value }))
              }
              placeholder="Path prefix like src/ or docs/"
              className="h-8 max-w-64"
            />
          </div>

          {activeFilterBadges.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {activeFilterBadges.map((filter) => (
                <Badge key={filter} variant="outline">
                  {filter}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Filters apply to both answer generation and search evidence.
            </p>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="self-start">
          <TabsTrigger value="ask">
            <Sparkles className="size-4" />
            Ask
          </TabsTrigger>
          <TabsTrigger value="search">
            <Search className="size-4" />
            Search
          </TabsTrigger>
          <TabsTrigger value="saved">
            <Bookmark className="size-4" />
            Saved
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ask" className="min-h-0 flex-1">
          <div className="flex h-full flex-col gap-4">
            <Card size="sm" className="rounded-2xl border border-border bg-background/70 shadow-none">
              <CardHeader className="gap-2 border-b border-border/70">
                <CardTitle className="text-base">Repository context brief</CardTitle>
                <CardDescription>
                  Ask for architecture, workflows, or implementation surfaces before you dig into
                  exact snippets.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <form onSubmit={handleAsk} className="flex flex-col gap-3">
                  <Textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Ask a repository-level question..."
                    disabled={isAnswering}
                    className="min-h-32"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" size="sm" disabled={isAnswering || !question.trim()}>
                      {isAnswering ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <MessageSquare className="size-4" />
                      )}
                      {isAnswering ? "Generating..." : "Ask Repository"}
                    </Button>
                    {answerResult ? (
                      <>
                        <Button type="button" size="sm" variant="outline" onClick={copyCurrentAnswerPack}>
                          <Copy className="size-4" />
                          Copy Answer Pack
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={saveAnswer}
                          disabled={!!savedAnswerId}
                        >
                          <Bookmark className="size-4" />
                          {savedAnswerId ? "Saved" : "Save Answer"}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </form>
              </CardContent>
            </Card>

            <ScrollArea className="min-h-0 flex-1">
              {!answerResult ? (
                <Card
                  size="sm"
                  className="rounded-2xl border border-dashed border-border bg-background/40 shadow-none"
                >
                  <CardContent className="py-16 text-center text-sm text-muted-foreground">
                    Ask a repository-level question to get a grounded answer plus inspectable
                    supporting code.
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-4 pr-3">
                  <Card className="rounded-2xl border border-border bg-background/80 shadow-none">
                    <CardHeader className="gap-3 border-b border-border/70">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">Grounded answer</Badge>
                        {savedAnswerId ? <Badge variant="outline">Saved</Badge> : null}
                        <Badge variant="outline">{answerResult.citations.length} citations</Badge>
                        {activeFilterBadges.map((filter) => (
                          <Badge key={filter} variant="outline">
                            {filter}
                          </Badge>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <CardTitle className="text-lg leading-tight">{answerResult.question}</CardTitle>
                        <CardDescription>
                          Grounded answer from indexed repo context. Review the evidence below
                          before exporting it to an agent.
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-5 pt-5">
                      <AnswerRichText text={answerResult.answer} />
                      <div className="space-y-2 rounded-2xl border border-border/70 bg-card/60 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">Supporting evidence</p>
                            <p className="text-xs text-muted-foreground">
                              Review the cited code blocks before sending them to the cart.
                            </p>
                          </div>
                          <Button size="xs" variant="outline" onClick={addAllCitationsToCart}>
                            Add All To Cart
                          </Button>
                        </div>
                        {topCitationFiles.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {topCitationFiles.map((file) => (
                              <Badge key={file} variant="secondary">
                                {file}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex flex-col gap-3">
                    {answerResult.citations.map((citation, index) => (
                      <RetrievalResultCard
                        key={`${citation.filePath}-${citation.chunkIndex}-${citation.id}`}
                        result={citation}
                        inCart={has(citation.id)}
                        onAdd={() => addToCart(citation)}
                        onCopy={() => copySnippet(citation)}
                        defaultExpanded={index === 0}
                      />
                    ))}
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="search" className="min-h-0 flex-1">
          <div className="flex h-full flex-col gap-4">
            <Card size="sm" className="rounded-2xl border border-border bg-background/70 shadow-none">
              <CardHeader className="gap-2 border-b border-border/70">
                <CardTitle className="text-base">Inspect exact evidence</CardTitle>
                <CardDescription>
                  Use search when you want declaration sites, implementation details, or
                  neighboring code after you already understand the repo-level answer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <form onSubmit={handleSearch} className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search for a function, workflow, or file..."
                      className="flex-1"
                      disabled={isSearching}
                    />
                    <Button type="submit" size="sm" disabled={isSearching || !query.trim()}>
                      {isSearching ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Search className="size-4" />
                      )}
                      {isSearching ? "Searching..." : "Search"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {symbolStyleQuery ? (
                      <Badge variant="secondary">Exact symbol-style query</Badge>
                    ) : null}
                    <Badge variant="outline">
                      Best matching code chunks, not guaranteed declaration sites
                    </Badge>
                  </div>
                </form>
              </CardContent>
            </Card>

            <ScrollArea className="min-h-0 flex-1">
              {!hasSearched ? (
                <Card
                  size="sm"
                  className="rounded-2xl border border-dashed border-border bg-background/40 shadow-none"
                >
                  <CardContent className="py-16 text-center text-sm text-muted-foreground">
                    Search your codebase with natural language or exact symbol names.
                  </CardContent>
                </Card>
              ) : groupedResults.length === 0 ? (
                <Card
                  size="sm"
                  className="rounded-2xl border border-dashed border-border bg-background/40 shadow-none"
                >
                  <CardContent className="py-16 text-center text-sm text-muted-foreground">
                    No results found. Try a different query or loosen the filters.
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-5 pr-3">
                  {groupedResults.map((group) => (
                    <div key={group.filePath} className="flex flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{group.fileName}</p>
                          <p className="break-all text-xs text-muted-foreground">{group.filePath}</p>
                        </div>
                        <Badge variant="outline">
                          {group.results.length} {group.results.length === 1 ? "match" : "matches"}
                        </Badge>
                      </div>
                      <div className="flex flex-col gap-3">
                        {group.results.map((result, index) => (
                          <RetrievalResultCard
                            key={result.id}
                            result={result}
                            inCart={has(result.id)}
                            onAdd={() => addToCart(result)}
                            onCopy={() => copySnippet(result)}
                            defaultExpanded={index === 0}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        <TabsContent value="saved" className="min-h-0 flex-1">
          <ScrollArea className="flex-1">
            {isLoadingSavedAnswers ? (
              <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading saved answers...
              </div>
            ) : savedAnswers.length === 0 ? (
              <Alert>
                <AlertDescription>
                  No saved answers yet. Generate an answer first, then save it here as a reusable
                  repo brief.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex flex-col gap-3 pr-3">
                {savedAnswers.map((saved) => (
                  <Card
                    key={saved.id}
                    size="sm"
                    className="rounded-2xl border border-border bg-background/70 shadow-none"
                  >
                    <CardHeader className="gap-2 border-b border-border/70">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <CardTitle className="line-clamp-2 text-sm">{saved.question}</CardTitle>
                          <CardDescription>
                            {saved._count.citations} supporting{" "}
                            {saved._count.citations === 1 ? "citation" : "citations"}
                          </CardDescription>
                        </div>
                        <Badge variant="outline">
                          {new Date(saved.updatedAt).toLocaleDateString()}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => loadSavedAnswer(saved.id)}
                          disabled={activeSavedAnswerId === saved.id}
                        >
                          {activeSavedAnswerId === saved.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <MessageSquare className="size-3.5" />
                          )}
                          Open Brief
                        </Button>
                        <Button size="xs" variant="outline" onClick={() => copySavedAnswerPack(saved.id)}>
                          <Copy className="size-3.5" />
                          Export
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => deleteSavedAnswer(saved.id)}>
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function isSymbolStyleQuery(query: string) {
  const trimmed = query.trim()
  if (!trimmed || trimmed.includes(" ")) return false
  return /^[A-Za-z_$][\w$]*(?:[.:][A-Za-z_$][\w$]*)*$/.test(trimmed)
}

function groupSearchResults(results: SearchResult[]) {
  const grouped = new Map<
    string,
    { filePath: string; fileName: string; results: SearchResult[] }
  >()

  for (const result of results) {
    const current = grouped.get(result.filePath)
    if (current) {
      current.results.push(result)
      continue
    }

    grouped.set(result.filePath, {
      filePath: result.filePath,
      fileName: result.filePath.split(/[/\\]/).pop() ?? result.filePath,
      results: [result],
    })
  }

  return Array.from(grouped.values())
}

function getTopCitationFiles(citations: SearchResult[]) {
  const counts = new Map<string, number>()

  for (const citation of citations) {
    counts.set(citation.filePath, (counts.get(citation.filePath) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([filePath]) => filePath.split(/[/\\]/).pop() ?? filePath)
}
