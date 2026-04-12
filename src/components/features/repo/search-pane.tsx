"use client"

import { useState } from "react"
import { Search, Plus, Check, Loader2, FileCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "sonner"
import { useContextCart, type CartItem } from "@/store/context-cart"

type SearchResult = {
  id: string
  filePath: string
  chunkIndex: number
  language: string | null
  content: string
  score: number
}

type SearchPaneProps = { repoId: string }

export function SearchPane({ repoId }: SearchPaneProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const { add, has } = useContextCart()

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setIsSearching(true)
    try {
      const res = await fetch(`/api/repo/${repoId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
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

  function addToCart(result: SearchResult) {
    const item: CartItem = { ...result, repositoryId: repoId }
    add(item)
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Describe what you're looking for…"
          className="flex-1"
          disabled={isSearching}
        />
        <Button type="submit" size="sm" disabled={isSearching || !query.trim()}>
          {isSearching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Search className="size-4" />
          )}
          {isSearching ? "Searching…" : "Search"}
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
          {result.language && (
            <Badge variant="secondary" className="shrink-0 text-xs">
              {result.language}
            </Badge>
          )}
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
