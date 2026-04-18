"use client"

import { useCallback, useMemo, useState } from "react"
import {
  Bot,
  Copy,
  Cpu,
  KeyRound,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Terminal,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

const CLAUDE_STEPS = [
  {
    title: "Clone context-compiler locally",
    body: "Get a local copy of the context-compiler repo and run bun install inside it. You need it so the MCP server binary is available on your machine.",
  },
  {
    title: "Enter your local path above",
    body: "Type the absolute path to your clone (e.g. C:\\Users\\you\\context-compiler on Windows or /Users/you/context-compiler on Mac). This fills in cwd in the generated command.",
  },
  {
    title: "Run the CLI command in PowerShell or Terminal",
    body: "Open PowerShell (Windows) or Terminal (Mac/Linux) — not the Claude app, a regular terminal. Paste the single-line command and press Enter. It writes directly into ~/.claude/settings.json with no manual file editing.",
  },
  {
    title: "Verify with /mcp inside Claude Code",
    body: "Open Claude Code (the desktop app or VS Code extension). Type /mcp and press Enter. You should see context-compiler listed as connected. The tools search_codebase, answer_repo_question, get_file_context, and build_context_pack are now available.",
  },
]

const CODEX_STEPS = [
  {
    title: "Clone context-compiler locally",
    body: "Get a local copy of the context-compiler repo and run bun install inside it.",
  },
  {
    title: "Enter your local path above",
    body: "Type the absolute path to your context-compiler clone. On Windows use forward slashes or double backslashes (e.g. C:\\\\Users\\\\you\\\\context-compiler).",
  },
  {
    title: "Open ~/.codex/config.toml in a text editor",
    body: "On Windows this is C:\\Users\\you\\.codex\\config.toml. On Mac/Linux it is ~/.codex/config.toml. Create the file if it does not exist. Paste the TOML snippet at the bottom.",
  },
  {
    title: "Restart Codex CLI",
    body: "Close and reopen any Codex session. Run codex in your terminal. Context Compiler tools will appear automatically — you can ask Codex to search_codebase or answer_repo_question.",
  },
]

const OTHER_STEPS = [
  {
    title: "Clone context-compiler locally",
    body: "Any MCP stdio-compatible agent needs a local copy of context-compiler with bun install run inside it.",
  },
  {
    title: "Set the two environment variables",
    body: "Your agent must pass CONTEXT_COMPILER_BASE_URL and CONTEXT_COMPILER_MCP_KEY into the process environment when it spawns the server.",
  },
  {
    title: "Spawn via stdio transport",
    body: "Configure your agent to run bun run mcp:stdio from your context-compiler directory. Test the shell command above manually first — you should see a startup confirmation on stderr.",
  },
  {
    title: "Four read-only tools available",
    body: "search_codebase, answer_repo_question, get_file_context, and build_context_pack — all scoped to this repository only.",
  },
]

function StepList({ steps }: { steps: { title: string; body: string }[] }) {
  return (
    <ol className="space-y-4">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {i + 1}
          </span>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">{step.title}</p>
            <p className="text-xs leading-6 text-muted-foreground">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
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
  const [name, setName] = useState("Local agent key")
  const [plaintextKey, setPlaintextKey] = useState("")
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)
  const [localProjectPath, setLocalProjectPath] = useState("")

  // NEXT_PUBLIC_URL is inlined at build time — always correct even when running the
  // app locally, so snippets never show localhost as the server URL.
  const resolvedBaseUrl = (
    appBaseUrl ??
    process.env.NEXT_PUBLIC_URL?.replace(/\/+$/, "") ??
    "https://your-context-compiler-url"
  )
  const keyValue = plaintextKey || "<paste-your-repo-key>"
  const cwd = localProjectPath.trim() || "<path-to-context-compiler>"

  const mcpServersSnippet = useMemo(
    () =>
      JSON.stringify(
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
      ),
    [cwd, resolvedBaseUrl, keyValue]
  )

  const shellSnippet = useMemo(
    () =>
      `cd ${cwd}\n\nCONTEXT_COMPILER_BASE_URL="${resolvedBaseUrl}" \\\nCONTEXT_COMPILER_MCP_KEY="${keyValue}" \\\nbun run mcp:stdio`,
    [cwd, resolvedBaseUrl, keyValue]
  )

  // Claude Code: single-line CLI command — works on PowerShell, bash, and zsh
  const claudeCliSnippet = useMemo(
    () =>
      `claude mcp add context-compiler -s user -e CONTEXT_COMPILER_BASE_URL="${resolvedBaseUrl}" -e CONTEXT_COMPILER_MCP_KEY="${keyValue}" -- bun run --cwd "${cwd}" mcp:stdio`,
    [cwd, resolvedBaseUrl, keyValue]
  )

  // Codex uses TOML, not JSON
  const codexTomlSnippet = useMemo(() => {
    const escapedCwd = cwd.replace(/\\/g, "\\\\")
    return [
      `[mcp_servers.context-compiler]`,
      `command = "bun"`,
      `args = ["run", "mcp:stdio"]`,
      `cwd = "${escapedCwd}"`,
      ``,
      `[mcp_servers.context-compiler.env]`,
      `CONTEXT_COMPILER_BASE_URL = "${resolvedBaseUrl}"`,
      `CONTEXT_COMPILER_MCP_KEY = "${keyValue}"`,
    ].join("\n")
  }, [cwd, resolvedBaseUrl, keyValue])

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

  async function handleCreateKey() {
    setIsSubmitting(true)
    try {
      const response = await fetch(`/api/repo/${repoId}/mcp-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
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
      toast.success("Key created — copy it now, it won't be shown again.")
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

  function handleOpenChange(next: boolean) {
    if (next) {
      void loadKeys()
    } else {
      setPlaintextKey("")
      setRevealedKeyId(null)
    }
    setOpen(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" data-tour="mcp-button">
          <PlugZap />
          Use With Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="h-auto max-h-[92vh] w-[96vw] overflow-hidden p-0 sm:max-w-[96vw] xl:max-w-352 2xl:max-w-384">
        <div className="grid min-w-0 gap-0 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">

          {/* ─── Left pane: setup flow ─── */}
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
                Create a repo-scoped key, paste the generated config into your agent, and let it
                retrieve grounded code context without broad workspace access.
              </DialogDescription>
            </DialogHeader>

            {/* Feature cards */}
            <div className="grid min-w-0 gap-4 lg:grid-cols-3">
              <div className="min-w-0 rounded-2xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-foreground">
                  <Bot className="size-4 text-muted-foreground" />
                  One repo only
                </div>
                <p className="text-sm leading-7 text-muted-foreground">
                  Each key is bound to this repository only — agents cannot drift into other repos or your wider workspace.
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-foreground">
                  <ShieldCheck className="size-4 text-muted-foreground" />
                  Read-only tools
                </div>
                <p className="text-sm leading-7 text-muted-foreground">
                  Search, answer, inspect file context, and build packs — the server cannot scan, save, or mutate state.
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center gap-2 font-medium text-foreground">
                  <KeyRound className="size-4 text-muted-foreground" />
                  One-time reveal
                </div>
                <p className="text-sm leading-7 text-muted-foreground">
                  The plaintext key is shown once after creation. If lost, revoke it and generate a fresh one.
                </p>
              </div>
            </div>

            {/* ── Step 1: create a key ── */}
            <section className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Step 1 — Create a repo key
              </p>
              <div className="min-w-0 rounded-2xl border border-border bg-background p-5">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="mcp-key-name">Key name</Label>
                    <Input
                      id="mcp-key-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Local agent key"
                    />
                  </div>
                  <Button onClick={handleCreateKey} disabled={isSubmitting || !name.trim()}>
                    {isSubmitting ? "Creating..." : "Create Repo Key"}
                  </Button>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  The key authenticates as you, but only for this repository.
                </p>
              </div>

              {/* Inline plaintext reveal */}
              <div
                className={`flex min-w-0 items-center gap-4 rounded-2xl border p-4 transition-colors ${
                  plaintextKey
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-background"
                }`}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-xs font-medium text-foreground">
                    {plaintextKey
                      ? "Copy this key now — it won't be shown again"
                      : "Your key will appear here after creation"}
                  </p>
                  <p className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                    {plaintextKey || "ccmcp_••••••••••••••••••••••••••••••"}
                  </p>
                </div>
                <Button
                  variant={plaintextKey ? "default" : "outline"}
                  size="sm"
                  disabled={!plaintextKey}
                  onClick={() => copyText(plaintextKey, "Key copied.")}
                >
                  <Copy />
                  Copy key
                </Button>
              </div>
            </section>

            {/* ── Step 2: connect your agent ── */}
            <section className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Step 2 — Connect your agent
              </p>

              {/* Shared path input — applies to all agent configs */}
              <div className="space-y-1.5">
                <Label htmlFor="local-project-path">Local path to context-compiler</Label>
                <Input
                  id="local-project-path"
                  value={localProjectPath}
                  onChange={(e) => setLocalProjectPath(e.target.value)}
                  placeholder="/Users/you/context-compiler"
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Absolute path to your local context-compiler clone. Sets <code>cwd</code> in the
                  generated config so the MCP server starts from the right directory.
                </p>
              </div>

              <Tabs defaultValue="claude">
                <TabsList variant="line" className="w-full justify-start">
                  <TabsTrigger value="claude" className="gap-1.5">
                    <Bot className="size-3.5" />
                    Claude Code
                  </TabsTrigger>
                  <TabsTrigger value="codex" className="gap-1.5">
                    <Terminal className="size-3.5" />
                    Codex
                  </TabsTrigger>
                  <TabsTrigger value="other" className="gap-1.5">
                    <Cpu className="size-3.5" />
                    Other Agent
                  </TabsTrigger>
                </TabsList>

                {/* ── Claude Code ── */}
                <TabsContent value="claude" className="mt-5">
                  <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                    <div className="min-w-0 space-y-4">
                      {/* Primary: CLI command */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">
                            CLI command{" "}
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              recommended
                            </span>
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyText(claudeCliSnippet, "CLI command copied.")}
                          >
                            <Copy />
                            Copy
                          </Button>
                        </div>
                        <Textarea
                          value={claudeCliSnippet}
                          readOnly
                          className="min-h-28 min-w-0 font-mono text-xs"
                        />
                        <p className="text-xs text-muted-foreground">
                          Run this in <strong>PowerShell</strong> (Windows) or <strong>Terminal</strong> (Mac/Linux) — not inside the Claude app itself.
                          It writes the server config into{" "}
                          <code className="rounded-sm bg-muted px-1 py-0.5">~/.claude/settings.json</code>{" "}
                          automatically. Restart Claude Code after running it.
                        </p>
                      </div>
                      {/* Secondary: manual JSON */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">
                            Or edit{" "}
                            <code className="rounded-sm bg-muted px-1 py-0.5 text-xs">
                              ~/.claude/settings.json
                            </code>{" "}
                            manually
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyText(mcpServersSnippet, "Config copied.")}
                          >
                            <Copy />
                            Copy
                          </Button>
                        </div>
                        <Textarea
                          value={mcpServersSnippet}
                          readOnly
                          className="min-h-44 min-w-0 font-mono text-xs"
                        />
                      </div>
                    </div>
                    <StepList steps={CLAUDE_STEPS} />
                  </div>
                </TabsContent>

                {/* ── Codex ── */}
                <TabsContent value="codex" className="mt-5">
                  <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                    <div className="min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">
                          Paste into{" "}
                          <code className="rounded-sm bg-muted px-1 py-0.5 text-xs">
                            ~/.codex/config.toml
                          </code>
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyText(codexTomlSnippet, "Config copied.")}
                        >
                          <Copy />
                          Copy
                        </Button>
                      </div>
                      <Textarea
                        value={codexTomlSnippet}
                        readOnly
                        className="min-h-48 min-w-0 font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        Codex uses TOML format. Create the file if it doesn&apos;t exist yet. Backslashes
                        in Windows paths are doubled automatically.
                      </p>
                    </div>
                    <StepList steps={CODEX_STEPS} />
                  </div>
                </TabsContent>

                {/* ── Other Agent ── */}
                <TabsContent value="other" className="mt-5">
                  <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                    <div className="min-w-0 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">Shell command</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyText(shellSnippet, "Shell command copied.")}
                        >
                          <Copy />
                          Copy
                        </Button>
                      </div>
                      <Textarea
                        value={shellSnippet}
                        readOnly
                        className="min-h-32 min-w-0 font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        Any agent that supports the MCP stdio transport works. Set the two env vars
                        and configure your agent to spawn this command.
                      </p>
                    </div>
                    <StepList steps={OTHER_STEPS} />
                  </div>
                </TabsContent>
              </Tabs>
            </section>
          </div>

          {/* ─── Right pane: key list ─── */}
          <div className="min-w-0 border-t border-border bg-muted/30 p-6 xl:max-h-[92vh] xl:overflow-y-auto xl:border-t-0 xl:border-l">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium text-foreground">Your repo keys</h3>
                <p className="text-sm text-muted-foreground">
                  Revoke any key instantly to remove access.
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void loadKeys()}
                disabled={isLoading}
              >
                <RefreshCw className={isLoading ? "animate-spin" : ""} />
                <span className="sr-only">Refresh keys</span>
              </Button>
            </div>

            <div className="space-y-3">
              {keys.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background p-5 text-sm leading-7 text-muted-foreground">
                  No MCP keys yet. Create one above to connect your local agent.
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
            The local stdio server only needs{" "}
            <code className="rounded-sm bg-muted px-1 py-0.5">CONTEXT_COMPILER_BASE_URL</code> and{" "}
            <code className="rounded-sm bg-muted px-1 py-0.5">CONTEXT_COMPILER_MCP_KEY</code> — no
            other credentials required.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
