# MCP client configuration examples

Replace paths and placeholders. Keep the key in local client configuration or a secret manager; never commit it.

## Claude Code

```bash
claude mcp add context-compiler -s user \
  -e CONTEXT_COMPILER_BASE_URL="https://your-context-compiler.example" \
  -e CONTEXT_COMPILER_MCP_KEY="ccmcp_REPLACE_ME" \
  -- bun run --cwd "/absolute/path/to/Context-Compiler" mcp:stdio
```

## Codex CLI (`~/.codex/config.toml`)

```toml
[mcp_servers.context-compiler]
command = "bun"
args = ["run", "--cwd", "/absolute/path/to/Context-Compiler", "mcp:stdio"]

[mcp_servers.context-compiler.env]
CONTEXT_COMPILER_BASE_URL = "https://your-context-compiler.example"
CONTEXT_COMPILER_MCP_KEY = "ccmcp_REPLACE_ME"
```

## Generic JSON client (Claude Desktop-style configuration)

```json
{
  "mcpServers": {
    "context-compiler": {
      "command": "bun",
      "args": ["run", "--cwd", "/absolute/path/to/Context-Compiler", "mcp:stdio"],
      "env": {
        "CONTEXT_COMPILER_BASE_URL": "https://your-context-compiler.example",
        "CONTEXT_COMPILER_MCP_KEY": "ccmcp_REPLACE_ME"
      }
    }
  }
}
```

Client configuration formats change independently; consult the client's current documentation if its parser rejects the example. Context Compiler requires an MCP client that supports local stdio servers.
