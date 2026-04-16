"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Copy, Download, Loader2, Save, Trash2, Upload, X } from "lucide-react"
import { RetrievalResultCard } from "@/components/features/repo/retrieval-result-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { formatContextPack } from "@/lib/prompt-packs"
import { useContextCart, type CartItem } from "@/store/context-cart"
import { toast } from "sonner"

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
  const totalCharacters = useMemo(
    () => repoItems.reduce((sum, item) => sum + item.content.length, 0),
    [repoItems]
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

  async function copySnippet(item: CartItem) {
    try {
      await navigator.clipboard.writeText(item.content)
      toast.success("Snippet copied to clipboard.")
    } catch {
      toast.error("Failed to copy snippet.")
    }
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
    <div className="flex h-full flex-col gap-4">
      <Card size="sm" className="rounded-2xl border border-border bg-background/70 shadow-none">
        <CardHeader className="gap-2 border-b border-border/70">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Context review workspace</CardTitle>
            <Badge variant="secondary">{repoItems.length} items</Badge>
            <Badge variant="outline">~{totalCharacters.toLocaleString()} chars</Badge>
          </div>
          <CardDescription>
            Review what is actually going into the exported context pack before you copy or save it.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          {repoItems.length > 0 ? (
            <div className="flex flex-wrap gap-2">
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
          ) : (
            <p className="text-sm text-muted-foreground">
              Add evidence from search results or answer citations to build a focused context pack.
            </p>
          )}
        </CardContent>
      </Card>

      <ScrollArea className="min-h-0 flex-1">
        {repoItems.length === 0 ? (
          <Card
            size="sm"
            className="rounded-2xl border border-dashed border-border bg-background/40 shadow-none"
          >
            <CardContent className="py-16 text-center text-sm text-muted-foreground">
              Add code blocks from search results or answer citations.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3 pr-3">
            {repoItems.map((item, index) => (
              <div key={`${item.id}-${item.repositoryId}`} className="relative">
                <RetrievalResultCard
                  result={{
                    id: item.id,
                    filePath: item.filePath,
                    chunkIndex: item.chunkIndex,
                    language: item.language,
                    content: item.content,
                    score: item.score,
                  }}
                  onCopy={() => copySnippet(item)}
                  defaultExpanded={index === 0}
                />
                <div className="absolute top-3 right-3">
                  <Button size="icon-xs" variant="ghost" onClick={() => remove(item.id)}>
                    <X className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <Card size="sm" className="rounded-2xl border border-border bg-background/70 shadow-none">
        <CardHeader className="gap-2 border-b border-border/70">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Saved carts</CardTitle>
            {isLoadingSavedCarts ? (
              <span className="text-xs text-muted-foreground">Loading...</span>
            ) : (
              <Badge variant="outline">{savedCarts.length} saved</Badge>
            )}
          </div>
          <CardDescription>
            Reopen, update, or export context packs you want to reuse across tasks.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <ScrollArea className="h-56">
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
              <div className="flex flex-col gap-3 pr-3">
                {savedCarts.map((cart) => (
                  <Card
                    key={cart.id}
                    size="sm"
                    className="rounded-2xl border border-border bg-card/60 shadow-none"
                  >
                    <CardHeader className="gap-1 border-b border-border/70">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="truncate text-sm">{cart.title}</CardTitle>
                          <CardDescription>
                            {cart._count.items} {cart._count.items === 1 ? "item" : "items"}
                          </CardDescription>
                        </div>
                        <Badge variant="outline">
                          {new Date(cart.updatedAt).toLocaleDateString()}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="flex flex-wrap gap-2">
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
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

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
              placeholder="Database architecture slice"
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
            <Button
              onClick={saveCart}
              disabled={isSaving || !saveTitle.trim() || repoItems.length === 0}
            >
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {isSaving ? "Saving..." : "Save Cart"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
