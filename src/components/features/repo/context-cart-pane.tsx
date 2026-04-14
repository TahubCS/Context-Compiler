"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, Download, Loader2, Save, Trash2, Upload, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { useContextCart, type CartItem } from "@/store/context-cart"
import { formatContextPack } from "@/lib/prompt-packs"

type SavedCartSummary = {
  id: string
  title: string
  description: string | null
  updatedAt: string
  _count: {
    items: number
  }
}

type ContextCartPaneProps = {
  repoId: string
  repositoryName: string
}

export function ContextCartPane({ repoId, repositoryName }: ContextCartPaneProps) {
  const [savedCarts, setSavedCarts] = useState<SavedCartSummary[]>([])
  const [isLoadingSavedCarts, setIsLoadingSavedCarts] = useState(true)
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false)
  const [saveTitle, setSaveTitle] = useState("")
  const [saveDescription, setSaveDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [activeCartId, setActiveCartId] = useState<string | null>(null)
  const { items, remove, clearRepository, replaceRepositoryItems } = useContextCart()

  const repoItems = useMemo(
    () => items.filter((item) => item.repositoryId === repoId),
    [items, repoId]
  )

  const loadSavedCarts = useCallback(async () => {
    setIsLoadingSavedCarts(true)
    try {
      const res = await fetch(`/api/repo/${repoId}/carts`)
      const data = (await res.json()) as { carts?: SavedCartSummary[]; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to load saved carts.")
        return
      }
      setSavedCarts(data.carts ?? [])
    } catch {
      toast.error("Could not load saved carts.")
    } finally {
      setIsLoadingSavedCarts(false)
    }
  }, [repoId])

  useEffect(() => {
    void loadSavedCarts()
  }, [repoId, loadSavedCarts])

  function copyAll() {
    const text = formatContextPack(
      repositoryName,
      repoItems.map((item) => ({
        filePath: item.filePath,
        chunkIndex: item.chunkIndex,
        language: item.language,
        content: item.content,
      }))
    )

    navigator.clipboard.writeText(text).then(
      () => toast.success("Context pack copied to clipboard."),
      () => toast.error("Failed to copy context pack.")
    )
  }

  async function saveCart() {
    if (!saveTitle.trim() || repoItems.length === 0) return

    setIsSaving(true)
    try {
      const res = await fetch(`/api/repo/${repoId}/carts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: saveTitle.trim(),
          description: saveDescription.trim() || null,
          items: repoItems,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save cart.")
        return
      }

      setIsSaveDialogOpen(false)
      setSaveTitle("")
      setSaveDescription("")
      await loadSavedCarts()
      toast.success("Context cart saved.")
    } catch {
      toast.error("Could not save context cart.")
    } finally {
      setIsSaving(false)
    }
  }

  async function loadSavedCart(cartId: string) {
    setActiveCartId(cartId)
    try {
      const res = await fetch(`/api/repo/${repoId}/carts/${cartId}`)
      const data = (await res.json()) as {
        cart?: {
          items: Array<{
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

      if (!res.ok || !data.cart) {
        toast.error(data.error ?? "Failed to load saved cart.")
        return
      }

      const loadedItems: CartItem[] = data.cart.items.map((item) => ({
        id: item.codeDocumentId ?? `${item.filePath}-${item.chunkIndex}`,
        repositoryId: repoId,
        filePath: item.filePath,
        chunkIndex: item.chunkIndex,
        language: item.language,
        content: item.contentSnapshot,
        score: item.score ?? 0,
      }))

      replaceRepositoryItems(repoId, loadedItems)
      toast.success("Saved cart loaded into the current context cart.")
    } catch {
      toast.error("Could not load saved cart.")
    } finally {
      setActiveCartId(null)
    }
  }

  async function overwriteSavedCart(cart: SavedCartSummary) {
    if (repoItems.length === 0) {
      toast.error("Add at least one context item before updating a saved cart.")
      return
    }

    setActiveCartId(cart.id)
    try {
      const res = await fetch(`/api/repo/${repoId}/carts/${cart.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cart.title,
          description: cart.description,
          items: repoItems,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update saved cart.")
        return
      }

      await loadSavedCarts()
      toast.success("Saved cart updated.")
    } catch {
      toast.error("Could not update saved cart.")
    } finally {
      setActiveCartId(null)
    }
  }

  async function exportSavedCart(cartId: string) {
    setActiveCartId(cartId)
    try {
      const res = await fetch(`/api/repo/${repoId}/carts/${cartId}/export`)
      const text = await res.text()
      if (!res.ok) {
        toast.error(text || "Failed to export saved cart.")
        return
      }
      await navigator.clipboard.writeText(text)
      toast.success("Saved context pack copied to clipboard.")
    } catch {
      toast.error("Could not export saved cart.")
    } finally {
      setActiveCartId(null)
    }
  }

  async function deleteSavedCart(cartId: string) {
    setActiveCartId(cartId)
    try {
      const res = await fetch(`/api/repo/${repoId}/carts/${cartId}`, {
        method: "DELETE",
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Failed to delete saved cart.")
        return
      }

      await loadSavedCarts()
      toast.success("Saved cart deleted.")
    } catch {
      toast.error("Could not delete saved cart.")
    } finally {
      setActiveCartId(null)
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {repoItems.length} {repoItems.length === 1 ? "item" : "items"}
        </span>
        {repoItems.length > 0 ? (
          <div className="ml-auto flex flex-wrap gap-1">
            <Button size="xs" variant="outline" onClick={copyAll}>
              <Copy className="size-3.5" />
              Copy Pack
            </Button>
            <Button size="xs" variant="secondary" onClick={() => setIsSaveDialogOpen(true)}>
              <Save className="size-3.5" />
              Save Cart
            </Button>
            <Button size="xs" variant="ghost" onClick={() => clearRepository(repoId)}>
              <Trash2 className="size-3.5" />
              Clear
            </Button>
          </div>
        ) : null}
      </div>

      <ScrollArea className="flex-1">
        {repoItems.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Add code blocks from search results or answer citations.
          </p>
        ) : (
          <div className="flex flex-col gap-2 pr-3">
            {repoItems.map((item) => (
              <div
                key={`${item.id}-${item.repositoryId}`}
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

      <div className="border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Saved Carts</h3>
          {isLoadingSavedCarts ? (
            <span className="text-xs text-muted-foreground">Loading...</span>
          ) : (
            <span className="text-xs text-muted-foreground">{savedCarts.length} saved</span>
          )}
        </div>
        <ScrollArea className="h-48">
          {isLoadingSavedCarts ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Loading saved carts...
            </div>
          ) : savedCarts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Save a cart to reopen it later.
            </p>
          ) : (
            <div className="flex flex-col gap-2 pr-3">
              {savedCarts.map((cart) => (
                <div
                  key={cart.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{cart.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {cart._count.items} items
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(cart.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => loadSavedCart(cart.id)}
                      disabled={activeCartId === cart.id}
                    >
                      {activeCartId === cart.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Upload className="size-3.5" />
                      )}
                      Load
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => overwriteSavedCart(cart)}
                      disabled={activeCartId === cart.id}
                    >
                      <Save className="size-3.5" />
                      Update
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => exportSavedCart(cart.id)}>
                      <Download className="size-3.5" />
                      Export
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => deleteSavedCart(cart.id)}>
                      <Trash2 className="size-3.5" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Context Cart</DialogTitle>
            <DialogDescription>
              Store this context pack on the server so you can reopen or export it later.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              value={saveTitle}
              onChange={(event) => setSaveTitle(event.target.value)}
              placeholder="Auth flow context"
            />
            <Textarea
              value={saveDescription}
              onChange={(event) => setSaveDescription(event.target.value)}
              placeholder="Optional notes about what this cart is for..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveCart} disabled={isSaving || !saveTitle.trim() || repoItems.length === 0}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isSaving ? "Saving..." : "Save Cart"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
