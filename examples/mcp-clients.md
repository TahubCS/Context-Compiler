# MCP client configuration examples

Replace `https://your-context-compiler.example` with your deployment and `ccmcp_REPLACE_ME` with a repository key from the repository page (**Use With Agent**). Keep keys in local client configuration or a secret manager; never commit them.

## Remote server (recommended)

Context Compiler serves MCP over Streamable HTTP at `<base-url>/api/mcp`. Nothing needs to be cloned or installed.

### Claude Code

Run in your checkout of the bound repository:

```bash
claude mcp add --transport http context-compiler https://your-context-compiler.example/api/mcp \
  --header "Authorization: Bearer ccmcp_REPLACE_ME"
```

Add `-s user` to make it available in every project. Check with `/mcp` inside Claude Code.

### Codex CLI

```bash
export CONTEXT_COMPILER_MCP_KEY="ccmcp_REPLACE_ME"   # put this in your shell profile
codex mcp add context-compiler --url https://your-context-compiler.example/api/mcp \
  --bearer-token-env-var CONTEXT_COMPILER_MCP_KEY
```

Or in `~/.codex/config.toml`:

```toml
[mcp_servers.context-compiler]
url = "https://your-context-compiler.example/api/mcp"
bearer_token_env_var = "CONTEXT_COMPILER_MCP_KEY"
```

### Gemini CLI

```bash
gemini mcp add --transport http context-compiler https://your-context-compiler.example/api/mcp \
  --header "Authorization: Bearer ccmcp_REPLACE_ME"
```

`--transport http` is required; without it the header is ignored. Check with `gemini mcp list`.

### Generic JSON (`.mcp.json` and most editors)

```json
{
  "mcpServers": {
    "context-compiler": {
      "type": "http",
      "url": "https://your-context-compiler.example/api/mcp",
      "headers": { "Authorization": "Bearer ccmcp_REPLACE_ME" }
    }
  }
}
```

## Local stdio bridge (only for clients without remote server support)

Requires a clone of this repository with `bun install` run inside it. Point the client at the bridge file itself rather than `bun run --cwd … mcp:stdio`: the bridge then starts in your project folder and, with a workspace key, uses that folder's `origin` remote as the default repository (override with `CONTEXT_COMPILER_REPOSITORY`).

```bash
claude mcp add context-compiler \
  -e CONTEXT_COMPILER_BASE_URL="https://your-context-compiler.example" \
  -e CONTEXT_COMPILER_MCP_KEY="ccmcp_REPLACE_ME" \
  -- bun "/absolute/path/to/Context-Compiler/src/mcp/server.ts"
```

```json
{
  "mcpServers": {
    "context-compiler": {
      "command": "bun",
      "args": ["/absolute/path/to/Context-Compiler/src/mcp/server.ts"],
      "env": {
        "CONTEXT_COMPILER_BASE_URL": "https://your-context-compiler.example",
        "CONTEXT_COMPILER_MCP_KEY": "ccmcp_REPLACE_ME"
      }
    }
  }
}
```

Client configuration formats change independently; consult the client's current documentation if its parser rejects an example.
