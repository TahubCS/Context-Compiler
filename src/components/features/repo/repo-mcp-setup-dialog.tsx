"use client"

import { useCallback, useMemo, useState } from "react"
import {
  Bot,
  Copy,
  Cpu,
  KeyRound,
  Laptop,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type McpKeyItem = {
  id: string
  repositoryId: string | null
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

type Step = { title: string; body: string }

function claudeSteps(repositoryName: string, workspaceScope: boolean): Step[] {
  return [
    workspaceScope
      ? {
          title: "Open any terminal",
          body: "Use PowerShell (Windows) or Terminal (Mac/Linux), not the Claude app. The -s user flag registers the server for every project, and the agent passes the repository it is working in on each call.",
        }
      : {
          title: `Open a terminal in your checkout of ${repositoryName}`,
          body: "Use PowerShell (Windows) or Terminal (Mac/Linux), not the Claude app. The key only works for this repository, and running the command there keeps the server scoped to this project.",
        },
    {
      title: "Run the command",
      body: "It registers the remote server in Claude Code's config (~/.claude.json). Nothing to clone or install.",
    },
    {
      title: "Check it with /mcp",
      body: "Start claude and type /mcp. context-compiler should show as connected with its tools: search_codebase, answer_repo_question, get_file_context, build_context_pack, trace_feature_flow and list_repositories.",
    },
  ]
}

const CODEX_STEPS: Step[] = [
  {
    title: "Make the key available to Codex",
    body: "Codex reads the key from the CONTEXT_COMPILER_MCP_KEY environment variable. Add the export line to your shell profile (~/.zshrc, ~/.bashrc), or on Windows run setx CONTEXT_COMPILER_MCP_KEY \"<key>\" once, so Codex sees it every time it starts.",
  },
  {
    title: "Register the server",
    body: "Run the codex mcp add command. It writes the server into ~/.codex/config.toml. If you would rather not use an environment variable, paste the config.toml block instead.",
  },
  {
    title: "Restart Codex",
    body: "Start a new Codex session and run /mcp to see context-compiler and its tools.",
  },
]

const GEMINI_STEPS: Step[] = [
  {
    title: "Run the command",
    body: "The --transport http flag matters: without it Gemini CLI assumes a local stdio server and ignores the header. Add --scope user to make the server available in every project.",
  },
  {
    title: "Check it",
    body: "Run gemini mcp list, or type /mcp inside Gemini CLI. context-compiler should list its tools.",
  },
]

const OTHER_STEPS: Step[] = [
  {
    title: "Use your client's remote server settings",
    body: "Any client that supports Streamable HTTP MCP servers works. Point it at the URL and send the key as an Authorization: Bearer header.",
  },
  {
    title: "Field names vary by client",
    body: "The JSON shown is the .mcp.json format used by Claude Code and many editors. Gemini CLI calls the URL field httpUrl; check your client's docs if it rejects the config.",
  },
]

const STDIO_STEPS: Step[] = [
  {
    title: "Only if your client cannot use remote servers",
    body: "The local bridge needs a clone of context-compiler with bun install run inside it. It forwards each tool call to this web app.",
  },
  {
    title: "Enter the clone's absolute path",
    body: "For example C:\\Users\\you\\context-compiler on Windows or /Users/you/context-compiler on Mac. The commands below update as you type.",
  },
  {
    title: "Register and verify",
    body: "Run the Claude Code command or paste the JSON into your client. Test the bridge first with bun run mcp:doctor using the same two environment variables.",
  },
]

function StepList({ steps }: { steps: Step[] }) {
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

function SnippetBlock({
  title,
  value,
  onCopy,
  minHeight,
}: {
  title: string
  value: string
  onCopy: (value: string, message: string) => void
  minHeight: string
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <Button variant="outline" size="sm" onClick={() => onCopy(value, "Copied.")}>
          <Copy />
          Copy
        </Button>
      </div>
      <Textarea value={value} readOnly className={`${minHeight} min-w-0 font-mono text-xs`} />
    </div>
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
  const [workspaceScope, setWorkspaceScope] = useState(false)

  // Prefer the configured public URL (inlined at build time) so snippets point at the
  // deployed app even when this page is served from a local dev server.
  const [browserOrigin, setBrowserOrigin] = useState<string | null>(null)
  const resolvedBaseUrl = (
    appBaseUrl ??
    process.env.NEXT_PUBLIC_URL ??
    browserOrigin ??
    "https://your-context-compiler-url"
  ).replace(/\/+$/, "")
  const mcpUrl = `${resolvedBaseUrl}/api/mcp`
  const keyValue = plaintextKey || "<paste-your-repo-key>"
  const cwd = (localProjectPath.trim() || "<path-to-context-compiler>").replace(/[\\/]+$/, "")
  // Run the bridge file directly (not `bun run --cwd`), so it starts in the agent's project
  // folder and can read that folder's git remote to pick the repository.
  const bridgeScript = `${cwd}/src/mcp/server.ts`

  // A workspace key works in every project, so register it for the user rather than one folder.
  const claudeRemoteSnippet = `claude mcp add --transport http${workspaceScope ? " -s user" : ""} context-compiler ${mcpUrl} --header "Authorization: Bearer ${keyValue}"`

  const codexRemoteSnippet = [
    `export CONTEXT_COMPILER_MCP_KEY="${keyValue}"`,
    `codex mcp add context-compiler --url ${mcpUrl} --bearer-token-env-var CONTEXT_COMPILER_MCP_KEY`,
  ].join("\n")

  const codexTomlSnippet = [
    `[mcp_servers.context-compiler]`,
    `url = "${mcpUrl}"`,
    `http_headers = { Authorization = "Bearer ${keyValue}" }`,
  ].join("\n")

  const geminiRemoteSnippet = `gemini mcp add --transport http context-compiler ${mcpUrl} --header "Authorization: Bearer ${keyValue}"`

  const remoteJsonSnippet = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            "context-compiler": {
              type: "http",
              url: mcpUrl,
              headers: { Authorization: `Bearer ${keyValue}` },
            },
          },
        },
        null,
        2
      ),
    [mcpUrl, keyValue]
  )

  const stdioJsonSnippet = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            "context-compiler": {
              command: "bun",
              args: [bridgeScript],
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
    [bridgeScript, resolvedBaseUrl, keyValue]
  )

  const claudeStdioSnippet = `claude mcp add context-compiler -e CONTEXT_COMPILER_BASE_URL="${resolvedBaseUrl}" -e CONTEXT_COMPILER_MCP_KEY="${keyValue}" -- bun "${bridgeScript}"`

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
        body: JSON.stringify({ name: name.trim(), scope: workspaceScope ? "workspace" : "repository" }),
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
      setBrowserOrigin(window.location.origin)
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
                <div className="mt-4 flex items-start gap-3">
                  <Switch
                    id="mcp-key-workspace-scope"
                    checked={workspaceScope}
                    onCheckedChange={setWorkspaceScope}
                  />
                  <Label htmlFor="mcp-key-workspace-scope" className="block space-y-1 font-normal">
                    <span className="block text-sm font-medium text-foreground">
                      Every repository in this workspace
                    </span>
                    <span className="block text-sm leading-6 text-muted-foreground">
                      {workspaceScope
                        ? "One key and one registration for all your repositories. The agent picks the repository it is working in on each call."
                        : `The key authenticates as you, but only for ${repositoryName}.`}
                    </span>
                  </Label>
                </div>
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
              <p className="text-sm leading-7 text-muted-foreground">
                Your agent connects straight to{" "}
                <code className="rounded-sm bg-muted px-1 py-0.5 text-xs">{mcpUrl}</code>. There is
                nothing to clone or install. Create a key first so the commands below include it.
              </p>

              <Tabs defaultValue="claude">
                <TabsList variant="line" className="w-full justify-start overflow-x-auto">
                  <TabsTrigger value="claude" className="gap-1.5">
                    <Bot className="size-3.5" />
                    Claude Code
                  </TabsTrigger>
                  <TabsTrigger value="codex" className="gap-1.5">
                    <Terminal className="size-3.5" />
                    Codex
                  </TabsTrigger>
                  <TabsTrigger value="gemini" className="gap-1.5">
                    <Sparkles className="size-3.5" />
                    Gemini CLI
                  </TabsTrigger>
                  <TabsTrigger value="other" className="gap-1.5">
                    <Cpu className="size-3.5" />
                    Other client
                  </TabsTrigger>
                  <TabsTrigger value="stdio" className="gap-1.5">
                    <Laptop className="size-3.5" />
                    Advanced: local stdio
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="claude" className="mt-5">
                  <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                    <SnippetBlock
                      title="Terminal command"
                      value={claudeRemoteSnippet}
                      onCopy={copyText}
                      minHeight="min-h-28"
                    />
                    <StepList steps={claudeSteps(repositoryName, workspaceScope)} />
                  </div>
                </TabsContent>

                <TabsContent value="codex" className="mt-5">
                  <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                    <div className="min-w-0 space-y-4">
                      <SnippetBlock
                        title="Terminal commands"
                        value={codexRemoteSnippet}
                        onCopy={copyText}
                        minHeight="min-h-28"
                      />
                      <SnippetBlock
                        title="Or paste into ~/.codex/config.toml"
                        value={codexTomlSnippet}
                        onCopy={copyText}
                        minHeight="min-h-24"
                      />
                    </div>
                    <StepList steps={CODEX_STEPS} />
                  </div>
                </TabsContent>

                <TabsContent value="gemini" className="mt-5">
                  <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                    <SnippetBlock
                      title="Terminal command"
                      value={geminiRemoteSnippet}
                      onCopy={copyText}
                      minHeight="min-h-28"
                    />
                    <StepList steps={GEMINI_STEPS} />
                  </div>
                </TabsContent>

                <TabsContent value="other" className="mt-5">
                  <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                    <SnippetBlock
                      title="Remote server JSON"
                      value={remoteJsonSnippet}
                      onCopy={copyText}
                      minHeight="min-h-44"
                    />
                    <StepList steps={OTHER_STEPS} />
                  </div>
                </TabsContent>

                <TabsContent value="stdio" className="mt-5">
                  <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                    <div className="min-w-0 space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="local-project-path">Local path to context-compiler</Label>
                        <Input
                          id="local-project-path"
                          value={localProjectPath}
                          onChange={(e) => setLocalProjectPath(e.target.value)}
                          placeholder="/Users/you/context-compiler"
                          className="font-mono text-xs"
                        />
                      </div>
                      <SnippetBlock
                        title="Claude Code command"
                        value={claudeStdioSnippet}
                        onCopy={copyText}
                        minHeight="min-h-28"
                      />
                      <SnippetBlock
                        title="JSON config"
                        value={stdioJsonSnippet}
                        onCopy={copyText}
                        minHeight="min-h-44"
                      />
                    </div>
                    <StepList steps={STDIO_STEPS} />
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
                            {key.repositoryId === null ? <Badge variant="outline">Workspace</Badge> : null}
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
            Agents only need the URL and a key. Keys are read-only and work for this repository
            alone; revoke one to cut off its access immediately.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
