"use client"

import { Copy, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "sonner"
import { useContextCart } from "@/store/context-cart"

export function ContextCartPane() {
  const { items, remove, clear } = useContextCart()

  function copyAll() {
    const text = items
      .map((item) => {
        const lang = item.language ?? ""
        return `--- FILE: ${item.filePath} (chunk ${item.chunkIndex}) ---\n\`\`\`${lang}\n${item.content}\n\`\`\``
      })
      .join("\n\n")

    navigator.clipboard.writeText(text).then(
      () => toast.success("Context copied to clipboard."),
      () => toast.error("Failed to copy to clipboard.")
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
        {items.length > 0 && (
          <div className="ml-auto flex gap-1">
            <Button size="xs" variant="outline" onClick={copyAll}>
              <Copy className="size-3.5" />
              Copy All
            </Button>
            <Button size="xs" variant="ghost" onClick={clear}>
              <Trash2 className="size-3.5" />
              Clear
            </Button>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        {items.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Add code blocks from search results.
          </p>
        ) : (
          <div className="flex flex-col gap-2 pr-3">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-foreground">
                    {item.filePath.split(/[/\\]/).pop()}
                  </span>
                  <Button size="icon-sm" variant="ghost" onClick={() => remove(item.id)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
                <span className="truncate text-xs text-muted-foreground">{item.filePath}</span>
                <pre className="line-clamp-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">
                  {item.content}
                </pre>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
