"use client"

import { useMemo, useState } from "react"
import { Check, ChevronDown, ChevronUp, Copy, FileCode, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type RetrievalResultCardData = {
  id: string
  filePath: string
  chunkIndex: number
  language: string | null
  content: string
  score?: number | null
  fileCategory?: string | null
  chunkType?: string | null
  pathBucket?: string | null
}

type RetrievalResultCardProps = {
  result: RetrievalResultCardData
  inCart?: boolean
  onAdd?: () => void
  onCopy?: () => void
  defaultExpanded?: boolean
  className?: string
}

const COLLAPSED_MAX_LINES = 16

export function RetrievalResultCard({
  result,
  inCart = false,
  onAdd,
  onCopy,
  defaultExpanded = false,
  className,
}: RetrievalResultCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const fileName = useMemo(
    () => result.filePath.split(/[/\\]/).pop() ?? result.filePath,
    [result.filePath]
  )
  const scorePercent =
    typeof result.score === "number" ? Math.max(0, Math.min(100, Math.round(result.score * 100))) : null

  return (
    <Card
      size="sm"
      className={cn("rounded-2xl border border-border bg-background/70 shadow-none", className)}
    >
      <CardHeader className="gap-3 border-b border-border/70">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <FileCode className="size-4 shrink-0 text-muted-foreground" />
              <CardTitle className="truncate text-sm">{fileName}</CardTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Chunk {result.chunkIndex}</Badge>
              {result.language ? <Badge variant="secondary">{result.language}</Badge> : null}
              {result.fileCategory ? <Badge variant="secondary">{result.fileCategory}</Badge> : null}
              {result.chunkType ? <Badge variant="outline">{result.chunkType}</Badge> : null}
              {scorePercent !== null ? (
                <Badge variant="ghost" className="text-muted-foreground">
                  {scorePercent}% match
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {onCopy ? (
              <Button size="xs" variant="outline" onClick={onCopy}>
                <Copy className="size-3.5" />
                Copy Snippet
              </Button>
            ) : null}
            {onAdd ? (
              <Button size="xs" variant={inCart ? "secondary" : "default"} onClick={onAdd} disabled={inCart}>
                {inCart ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                {inCart ? "In Cart" : "Add to Cart"}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="space-y-1">
          <p className="break-all text-xs text-muted-foreground">{result.filePath}</p>
          {result.pathBucket ? (
            <p className="text-xs text-muted-foreground">Path bucket: {result.pathBucket}</p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <pre
          className={cn(
            "overflow-x-auto rounded-xl border border-border/60 bg-card/60 p-4 font-mono text-xs leading-6 text-foreground",
            expanded ? "max-h-128 whitespace-pre-wrap" : "line-clamp-none whitespace-pre-wrap"
          )}
          style={expanded ? undefined : { display: "-webkit-box", WebkitLineClamp: COLLAPSED_MAX_LINES, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {result.content}
        </pre>
      </CardContent>
      <CardFooter className="justify-between border-t border-border/70 pt-4">
        <p className="text-xs text-muted-foreground">
          Inspect the snippet before sending it to the cart so the exported context stays intentional.
        </p>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {expanded ? "Collapse" : "Expand"}
        </Button>
      </CardFooter>
    </Card>
  )
}
