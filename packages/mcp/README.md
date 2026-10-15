# context-compiler-mcp

Connect Claude Code, Codex and Gemini CLI to a [Context Compiler](https://github.com/TahubCS/Context-Compiler) deployment in one command.

```bash
npx context-compiler-mcp connect --url https://your-context-compiler.example
```

1. Your browser opens to confirm a short code. Sign in if needed and approve.
2. The CLI's key is activated as a **workspace key** (read-only, every repository in your active workspace). The key was generated locally and is never shown or copied; the server stores only its hash.
3. Every supported agent found on this machine is registered for all projects:
   - Claude Code: `claude mcp add --transport http -s user …`
   - Gemini CLI: `gemini mcp add -s user --transport http …` (Gemini only enables MCP servers in folders you have trusted)
   - Codex: a `[mcp_servers.context-compiler]` entry in `~/.codex/config.toml` (or `$CODEX_HOME`)

Agents pass the repository they are working in (`owner/name`) on each call, or call `list_repositories`.

## Commands

| Command | What it does |
|---|---|
| `connect --url <app> [--agents claude,codex,gemini] [--project] [--no-open]` | Sign in and register. `--project` also writes `.mcp.json` in the current folder, pinned to its repository and reading the key from `CONTEXT_COMPILER_MCP_KEY`, so it is safe to commit. |
| `doctor` | Checks the saved key and each agent's registration. |
| `disconnect` | Removes the registrations, revokes the key, deletes the saved config. |
| `serve` (default) | Serves the tools over stdio for clients without remote MCP support, using the saved key and this folder's git remote as the default repository. |

The key and URL are saved in `~/.config/context-compiler/config.json` (mode 600). `CONTEXT_COMPILER_BASE_URL`, `CONTEXT_COMPILER_MCP_KEY` and `CONTEXT_COMPILER_REPOSITORY` override them.

## Building and publishing

The CLI is bundled with the shared MCP code from `src/mcp/` into one dependency-free file:

```bash
cd packages/mcp
bun run build                 # writes dist/cli.js
node dist/cli.js --help
npm publish --access public   # runs the build first
```

After publishing, set `NEXT_PUBLIC_MCP_CLI_AVAILABLE=true` in the web app so the agent setup dialog offers the one-command option.
