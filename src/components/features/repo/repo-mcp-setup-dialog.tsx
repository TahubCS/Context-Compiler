"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bot,
  Copy,
  KeyRound,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type McpKeyItem = {
  id: string
  name: string
  keyPrefix: string
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

type RepoMcpSetupDialogProps = {
  repoId: string
  repositoryName: string
  appBaseUrl?: string | null
}

function formatTimestamp(value: string | null) {
  if (!value) return "Never used"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function RepoMcpSetupDialog({
  repoId,
  repositoryName,
  appBaseUrl,
}: RepoMcpSetupDialogProps) {
  const [open, setOpen] = useState(false)
  const [keys, setKeys] = useState<McpKeyItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [name, setName] = useState("Codex local key")
  const [plaintextKey, setPlaintextKey] = useState("")
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)
  const [localProjectPath, setLocalProjectPath] = useState("")
  const [clientOrigin, setClientOrigin] = useState<string | null>(null)

  useEffect(() => {
    if (appBaseUrl) return
    setClientOrigin(window.location.origin)
  }, [appBaseUrl])

  const resolvedBaseUrl = appBaseUrl ?? clientOrigin ?? "https://your-context-compiler-url"

  const configSnippet = useMemo(() => {
    const keyValue = plaintextKey || "<paste-your-repo-key>"
    const cwd = localProjectPath.trim() || "<path-to-context-compiler>"
    return JSON.stringify(
      {
        mcpServers: {
          "context-compiler": {
            command: "bun",
            args: ["run", "mcp:stdio"],
            cwd,
            env: {
              CONTEXT_COMPILER_BASE_URL: resolvedBaseUrl,
              CONTEXT_COMPILER_MCP_KEY: keyValue,
            },
          },
        },
      },
      null,
      2
    )
  }, [plaintextKey, resolvedBaseUrl, localProjectPath])

  const loadKeys = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/repo/${repoId}/mcp-keys`)
      const data = (await response.json()) as { keys?: McpKeyItem[]; error?: string }

      if (!response.ok) {
        toast.error(data.error ?? "Failed to load MCP keys.")
        return
      }

      setKeys(data.keys ?? [])
    } catch {
      toast.error("Failed to reach the server.")
    } finally {
      setIsLoading(false)
    }
  }, [repoId])

  useEffect(() => {
    if (!open) return
    void loadKeys()
  }, [loadKeys, open])

  async function handleCreateKey() {
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/repo/${repoId}/mcp-keys`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
        }),
      })

      const data = (await response.json()) as {
        key?: McpKeyItem
        plaintextKey?: string
        error?: string
      }

      if (!response.ok || !data.key || !data.plaintextKey) {
        toast.error(data.error ?? "Could not create the MCP key.")
        return
      }

      setPlaintextKey(data.plaintextKey)
      setRevealedKeyId(data.key.id)
      setKeys((current) => [data.key!, ...current])
      toast.success("Repo-bound MCP key created. Copy it now because it will not be shown again.")
    } catch {
      toast.error("Could not reach the server.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRevoke(keyId: string) {
    setRevokingKeyId(keyId)
    try {
      const response = await fetch(`/api/repo/${repoId}/mcp-keys/${keyId}`, {
        method: "DELETE",
      })

      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        toast.error(data.error ?? "Could not revoke the MCP key.")
        return
      }

      setKeys((current) =>
        current.map((key) =>
          key.id === keyId ? { ...key, revokedAt: new Date().toISOString() } : key
        )
      )
      if (revealedKeyId === keyId) {
        setPlaintextKey("")
        setRevealedKeyId(null)
      }
      toast.success("MCP key revoked.")
    } catch {
      toast.error("Could not reach the server.")
    } finally {
      setRevokingKeyId(null)
    }
  }

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(message)
    } catch {
      toast.error("Copy failed.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-tour="mcp-button">
          <PlugZap />
          Use With Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="h-auto max-h-[92vh] w-[96vw] overflow-hidden p-0 sm:max-w-[96vw] xl:max-w-[88rem] 2xl:max-w-[96rem]">
        <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] 2xl:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.75fr)]">
          <div className="min-w-0 space-y-6 overflow-y-auto p-6 xl:max-h-[calc(92vh-5rem)]">
            <DialogHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Repo-bound MCP</Badge>
                <Badge variant="outline">Read-only</Badge>
              </div>
              <DialogTitle className="text-2xl leading-tight">
                Connect {repositoryName} to your local coding agent
              </DialogTitle>
              <DialogDescription className="max-w-2xl text-sm leading-7">
                Create a repo-scoped MCP key, paste the local stdio config into Claude Code or
                Codex, and let your agent retrieve grounded code context without broad workspace
                access.
              </DialogDescription>
            </DialogHeader>

            <div className="grid min-w-0 gap-4 lg:grid-cols-3">
              <div className="min-w-0 rounded-2xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-foreground">
                  <Bot className="size-4 text-muted-foreground" />
                  One repo only
                </div>
                <p className="text-sm leading-7 text-muted-foreground">
                  Each key is bound to this repository only, so agents cannot drift into other
                  repos or your wider workspace.
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-foreground">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  Read-only tools
                </div>
                <p className="text-sm leading-7 text-muted-foreground">
                  The first MCP release can search, answer, inspect file context, and build packs,
                  but it cannot scan, save, or mutate app state.
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-foreground">
                  <KeyRound className="size-4 text-muted-foreground" />
                  One-time reveal
                </div>
                <p className="text-sm leading-7 text-muted-foreground">
                  The plaintext key is shown once after creation. If you lose it, revoke it and
                  generate a fresh one.
                </p>
              </div>
            </div>

            <div className="min-w-0 rounded-2xl border border-border bg-background p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <div className="space-y-2">
                  <Label htmlFor="mcp-key-name">Key name</Label>
                  <Input
                    id="mcp-key-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Codex local key"
                  />
                </div>
                <Button onClick={handleCreateKey} disabled={isSubmitting || !name.trim()}>
                  {isSubmitting ? "Creating..." : "Create Repo Key"}
                </Button>
              </div>

              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                The generated key authenticates as you, but only for this repository.
              </p>
            </div>

            <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="min-w-0 space-y-3 rounded-2xl border border-border bg-background p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium text-foreground">Plaintext key</h3>
                    <p className="text-sm text-muted-foreground">Copy this immediately after creation.</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!plaintextKey}
                    onClick={() => copyText(plaintextKey, "MCP key copied.")}
                  >
                    <Copy />
                    Copy
                  </Button>
                </div>
                <Textarea
                  value={plaintextKey || "Create a repo key to reveal the plaintext value once."}
                  readOnly
                  className="min-h-32 min-w-0 overflow-x-auto font-mono text-xs"
                />
              </div>

              <div className="min-w-0 space-y-3 rounded-2xl border border-border bg-background p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium text-foreground">Local MCP config</h3>
                    <p className="text-sm text-muted-foreground">
                      Paste this into your Claude Code or Codex MCP configuration.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyText(configSnippet, "MCP config copied.")}
                  >
                    <Copy />
                    Copy
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="local-project-path">Local project path</Label>
                  <Input
                    id="local-project-path"
                    value={localProjectPath}
                    onChange={(event) => setLocalProjectPath(event.target.value)}
                    placeholder="/Users/you/context-compiler"
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Absolute path to your local context-compiler clone. Sets <code>cwd</code> so the MCP server runs from the right directory.
                  </p>
                </div>
                <Textarea
                  value={configSnippet}
                  readOnly
                  className="min-h-64 min-w-0 overflow-x-auto font-mono text-xs"
                />
              </div>
            </div>
          </div>

          <div className="min-w-0 border-t border-border bg-muted/30 p-6 xl:max-h-[92vh] xl:overflow-y-auto xl:border-t-0 xl:border-l">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium text-foreground">Your repo keys</h3>
                <p className="text-sm text-muted-foreground">
                  Revoke any key instantly if a machine or agent configuration should lose access.
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => void loadKeys()} disabled={isLoading}>
                <RefreshCw className={isLoading ? "animate-spin" : ""} />
                <span className="sr-only">Refresh keys</span>
              </Button>
            </div>

            <div className="space-y-3">
              {keys.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background p-5 text-sm leading-7 text-muted-foreground">
                  No MCP keys yet for this repo. Create one to connect your local agent.
                </div>
              ) : (
                keys.map((key) => {
                  const isRevoked = Boolean(key.revokedAt)
                  const isFreshlyCreated = revealedKeyId === key.id && !!plaintextKey

                  return (
                    <div
                      key={key.id}
                      className="min-w-0 rounded-2xl border border-border bg-background p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">{key.name}</span>
                            <Badge variant={isRevoked ? "outline" : "secondary"}>
                              {isRevoked ? "Revoked" : "Active"}
                            </Badge>
                            {isFreshlyCreated ? <Badge>Just created</Badge> : null}
                          </div>
                          <p className="font-mono text-xs text-muted-foreground">
                            {key.keyPrefix}...
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isRevoked || revokingKeyId === key.id}
                          onClick={() => void handleRevoke(key.id)}
                        >
                          <Trash2 />
                          {revokingKeyId === key.id ? "Revoking..." : "Revoke"}
                        </Button>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <div>Created {formatTimestamp(key.createdAt)}</div>
                        <div>Last used {formatTimestamp(key.lastUsedAt)}</div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border px-6 py-4">
          <p className="mr-auto text-xs leading-6 text-muted-foreground">
            The local stdio server only needs <code>CONTEXT_COMPILER_BASE_URL</code> and{" "}
            <code>CONTEXT_COMPILER_MCP_KEY</code>.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
