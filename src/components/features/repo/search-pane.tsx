"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Bookmark,
  Check,
  Copy,
  FileCode,
  Loader2,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "sonner"
import { useContextCart, type CartItem } from "@/store/context-cart"
import { formatAnswerPack } from "@/lib/prompt-packs"

type SearchResult = {
  id: string
  filePath: string
  chunkIndex: number
  language: string | null
  content: string
  score: number
}

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

type SearchPaneProps = { repoId: string; repositoryName: string }

export function SearchPane({ repoId, repositoryName }: SearchPaneProps) {
  const [activeTab, setActiveTab] = useState("search")
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
  const { add, has } = useContextCart()

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
        body: JSON.stringify({ query: trimmedQuery }),
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
        body: JSON.stringify({ question: trimmedQuestion }),
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
    const item: CartItem = { ...result, repositoryId: repoId }
    add(item)
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
    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
      <TabsList className="self-start">
        <TabsTrigger value="search">
          <Search className="size-4" />
          Search
        </TabsTrigger>
        <TabsTrigger value="ask">
          <Sparkles className="size-4" />
          Ask
        </TabsTrigger>
        <TabsTrigger value="saved">
          <Bookmark className="size-4" />
          Saved
        </TabsTrigger>
      </TabsList>

      <TabsContent value="search" className="min-h-0 flex-1">
        <div className="flex h-full flex-col gap-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Describe what you're looking for..."
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
          </form>

          <ScrollArea className="flex-1">
            {!hasSearched ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Search your codebase with natural language.
              </p>
            ) : results.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                No results found. Try a different query.
              </p>
            ) : (
              <div className="flex flex-col gap-2 pr-3">
                {results.map((result) => (
                  <SearchResultCard
                    key={result.id}
                    result={result}
                    inCart={has(result.id)}
                    onAdd={() => addToCart(result)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </TabsContent>

      <TabsContent value="ask" className="min-h-0 flex-1">
        <div className="flex h-full flex-col gap-3">
          <form onSubmit={handleAsk} className="flex flex-col gap-2">
            <Textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask a question about this repository..."
              disabled={isAnswering}
              className="min-h-28"
            />
            <div className="flex gap-2">
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

          <ScrollArea className="flex-1">
            {!answerResult ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Ask a repository-level question to get a grounded answer with citations.
              </p>
            ) : (
              <div className="flex flex-col gap-3 pr-3">
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">Answer</Badge>
                    {savedAnswerId ? <Badge variant="secondary">Saved</Badge> : null}
                    <Button size="xs" variant="outline" onClick={addAllCitationsToCart}>
                      <Plus className="size-3.5" />
                      Add All To Cart
                    </Button>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-foreground">{answerResult.answer}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-foreground">Citations</h3>
                    <span className="text-xs text-muted-foreground">
                      {answerResult.citations.length} supporting chunks
                    </span>
                  </div>
                  {answerResult.citations.map((citation) => (
                    <SearchResultCard
                      key={`${citation.filePath}-${citation.chunkIndex}-${citation.id}`}
                      result={citation}
                      inCart={has(citation.id)}
                      onAdd={() => addToCart(citation)}
                    />
                  ))}
                </div>
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
                No saved answers yet. Generate an answer first, then save it here for later.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col gap-2 pr-3">
              {savedAnswers.map((saved) => (
                <div
                  key={saved.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-medium text-foreground">
                        {saved.question}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {saved._count.citations} citations
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {new Date(saved.updatedAt).toLocaleDateString()}
                    </Badge>
                  </div>
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
                      Open
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => copySavedAnswerPack(saved.id)}>
                      <Copy className="size-3.5" />
                      Export
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => deleteSavedAnswer(saved.id)}
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}

type CardProps = { result: SearchResult; inCart: boolean; onAdd: () => void }

function SearchResultCard({ result, inCart, onAdd }: CardProps) {
  const scorePercent = Math.round(result.score * 100)
  const fileName = result.filePath.split(/[/\\]/).pop() ?? result.filePath

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileCode className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium text-foreground">{fileName}</span>
          {result.language ? (
            <Badge variant="secondary" className="shrink-0 text-xs">
              {result.language}
            </Badge>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">{scorePercent}%</span>
          <Button
            size="icon-sm"
            variant={inCart ? "secondary" : "outline"}
            onClick={onAdd}
            disabled={inCart}
          >
            {inCart ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
          </Button>
        </div>
      </div>
      <pre className="line-clamp-4 whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
        {result.content}
      </pre>
      <span className="truncate text-xs text-muted-foreground">{result.filePath}</span>
    </div>
  )
}
