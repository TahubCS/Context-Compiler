<p><img src="public/logo.svg" alt="" width="64" height="64"></p>

# Context Compiler

Context Compiler turns a GitHub repository into a searchable, repository-bound context service for humans and MCP-compatible AI clients. It clones and chunks source code, creates Gemini embeddings in PostgreSQL/pgvector, and exposes ranked code search, grounded Q&A, context packs, file context, and feature-flow tracing through a web UI and a read-only MCP server (remote Streamable HTTP, plus an optional local stdio bridge).

> **Project status:** self-hosted pre-release (`0.1.0`). It is a multi-service application, not a standalone local code-search binary. Scanning requires Supabase/PostgreSQL, a GitHub integration, the Python AI service, and Gemini credentials.

## Verified capabilities

- Hybrid semantic and lexical repository search with language, category, and path filters.
- Repository keys (one repository) or workspace keys (every repository in a workspace; the agent picks one per call, or the stdio bridge picks the checkout it starts in).
- Grounded repository answers with citations and a non-generative fallback.
- Prompt-ready context packs and indexed file chunk retrieval.
- Retrieval-based feature-flow/read-order suggestions.
- Incremental GitHub scans, GitHub App reconciliation/webhooks, repository-bound MCP API keys, workspaces, saved carts/answers, notifications, and optional Stripe billing.
- Two MCP transports: a remote **Streamable HTTP** endpoint at `/api/mcp` (nothing to install on the client) and an optional local **stdio** bridge that forwards to the same app.

Context Compiler currently registers six MCP tools. It registers no MCP resources or prompts. See the complete [MCP reference](docs/MCP_REFERENCE.md).

## Architecture

```mermaid
flowchart LR
  Client[MCP client\nClaude Code / Codex / Gemini CLI] -->|Streamable HTTP + repository-bound Bearer key| Web[Next.js app + /api/mcp]
  StdioClient[stdio-only MCP client] -->|stdio| Bridge[Optional local stdio bridge]
  Bridge -->|HTTPS + Bearer key| Web
  Browser[Browser] --> Web
  Web --> DB[(Supabase PostgreSQL + pgvector)]
  Web -->|scan/search/answer HTTP| AI[FastAPI AI backend]
  AI --> DB
  AI --> Gemini[Google Gemini]
  AI -->|clone/read repository| GitHub[GitHub]
  Web --> GitHub
  Web -. optional .-> Stripe[Stripe]
```

## Prerequisites

- Bun 1.x (the lockfile and scripts use Bun; CI should pin a tested release).
- Node-compatible runtime required by Next.js 16 (Node 20.9+ when not invoking through Bun).
- Python 3.11+ for the AI service.
- PostgreSQL with `pgvector` (the intended hosted provider is Supabase).
- GitHub OAuth and/or a GitHub App for login and repository access.
- A Google Gemini API key for embeddings. Stripe is optional unless billing routes are used.

## Five-minute MCP quick start

This path assumes an administrator has already deployed Context Compiler and scanned a repository.

1. On the repository page, open **Use With Agent**, create a repository-bound key, and copy it once.
2. Register the remote server with your agent. Run this in your checkout of that repository:
   ```bash
   claude mcp add --transport http context-compiler https://your-context-compiler.example/api/mcp \
     --header "Authorization: Bearer ccmcp_REPLACE_ME"
   ```
   The dialog shows the same command with your URL and key filled in, plus the [Codex, Gemini CLI and generic JSON forms](examples/mcp-clients.md).
3. In Claude Code, run `/mcp` to confirm `context-compiler` is connected, then ask it to call `search_codebase` with `{"query":"authentication entrypoint"}`.

Or, once the [`context-compiler-mcp`](packages/mcp/README.md) package is published, skip the key entirely:

```bash
npx context-compiler-mcp connect --url https://your-context-compiler.example
```

It signs in through the browser and registers a workspace key with Claude Code, Codex and Gemini CLI (whichever are installed).

The response contains repository metadata, a best match, related files, grouped matches, and structured content. Exact files and scores vary with the bound repository and its latest scan.

## Self-hosted installation

```bash
bun install --frozen-lockfile
bun run setup             # creates .env.local with generated secrets, then reports what is missing
bun run db:setup          # enables pgvector, runs prisma db push, builds the HNSW vector index
python -m venv ai-backend/.venv
ai-backend/.venv/bin/pip install -r ai-backend/requirements.txt
```

`bun run setup` never overwrites an existing `.env.local`; run it again after editing to re-check. It generates the callback, webhook, backend, GitHub-token and MCP-key secrets, and lists what each feature still needs: Supabase and the database for sign-in, the GitHub App for repository import, and the AI backend plus a Gemini key for scanning. The full inventory is in [`.env.example`](.env.example); never commit a filled-in environment file.

`db:setup` is safe to re-run. On a database created earlier with plain `prisma db push`, run `bun ./scripts/ensure-vector-index.ts` once: that btree index on the embedding column rejects every embedding insert. Patch migrations for existing deployments are in `prisma/migrations/` (0013 onward add the search index, workspace keys, CLI sign-in, usage log, and re-scan permission).

### Docker Compose

```bash
bun run setup                                   # then fill in Supabase, GitHub App and Gemini values
docker compose --env-file .env.local up --build
```

Starts PostgreSQL with pgvector, a one-shot `migrate` job (`db:setup`), the AI backend on port 8080, and the web app on port 3000. Sign-in still uses a hosted Supabase project. Without a Gemini key, set `EMBEDDING_PROVIDER=hash` for offline embeddings that match words rather than meaning.

### Development

Terminal 1:
```bash
bun run dev
```

Terminal 2:
```bash
cd ai-backend
../ai-backend/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

The AI backend reads `AI_BACKEND_SECRET`, `DATABASE_URL`, `GOOGLE_GEMINI_API_KEY` (or `EMBEDDING_PROVIDER=hash`) and `APP_BASE_URL` from its own environment. Then open `/api/health`: it checks the database, the vector and search indexes, that the AI backend is reachable with a matching secret, and the MCP and GitHub App settings. Sign in, connect GitHub, import and scan a repository, and connect an agent.

### Production

```bash
bun run build
bun run start
cd ai-backend && .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
```

The root `Dockerfile` builds the web app (pass `NEXT_PUBLIC_*` values as build arguments) and `ai-backend/Dockerfile` the AI service. Apply schema changes before deploying the application, put both services behind TLS, keep the AI backend private to the web app where possible, and configure the GitHub webhook at `/api/github-app/webhook`. Point uptime checks at `/api/health` (HTTP 200 when every check passes, 503 otherwise). If the AI backend reaches the web app at a different address than its public URL, set `AI_CALLBACK_BASE_URL`.

## MCP operation

The remote endpoint is `POST <base-url>/api/mcp` (Streamable HTTP, stateless, JSON responses). It authenticates every request with `Authorization: Bearer <key>` and returns 401 with a `WWW-Authenticate` header for a missing or revoked key.

The local stdio bridge is for clients that cannot use remote servers:

```bash
bun run mcp:stdio --help
bun run mcp:doctor
bun run mcp:stdio
```

`mcp:stdio` is normally spawned by a client, not typed interactively. It reserves stdout for MCP protocol frames and sends diagnostics to stderr. Required client-process variables are `CONTEXT_COMPILER_BASE_URL` and `CONTEXT_COMPILER_MCP_KEY`; optional `CONTEXT_COMPILER_TIMEOUT_MS` defaults to 60000 and accepts 1000–120000. The bridge connects even when the app is unreachable or a variable is missing; each tool call then returns the problem as a tool error.

## Configuration and security

- Treat repository keys, Supabase service roles, database URLs, GitHub tokens/private keys, Gemini keys, Stripe secrets, and callback/webhook secrets as credentials.
- Store them in platform secret storage or local untracked environment files. Rotate a key immediately if it enters logs, shell history, screenshots, or version control.
- MCP keys are repository-bound and read-only at the MCP tool layer. Create separate named keys per client and revoke unused keys.
- Do not put credentials in `CONTEXT_COMPILER_BASE_URL`; the bridge rejects credential-bearing URLs. Keep TLS verification enabled and use HTTPS outside local development.
- Grant the GitHub App only the repository access and permissions needed for content indexing and webhook events.
- The scanner sends a short-lived repository credential to the private AI service to clone the repository. Secure that network path and do not expose the AI service publicly without additional controls.
- Every AI backend route except `/health` requires `Authorization: Bearer $AI_BACKEND_SECRET`, and the service refuses to start without a secret of at least 32 characters. Scans only clone from `ALLOWED_GIT_HOSTS` (default `github.com`), and when `APP_BASE_URL` is set, scan callbacks may only target that origin.

## Troubleshooting

| Symptom | Cause / action |
|---|---|
| `Missing CONTEXT_COMPILER_BASE_URL` or `...MCP_KEY` | Add both variables to the MCP client's spawned-process environment, not only your interactive shell. |
| `Unauthorized` | The key is malformed, revoked, or points at another deployment. Create a new key for the repository and confirm the base URL. |
| Non-JSON response | The base URL likely points to a proxy error page or the Python backend. It must be the Next.js app origin. |
| Request timeout / connection failure | Run `bun run mcp:doctor`, check DNS/TLS and application health, then raise the timeout only if the service is healthy but slow. |
| Client shows disconnected or "needs auth" | For the remote server, check the URL ends in `/api/mcp` and the header is exactly `Authorization: Bearer ccmcp_...`. For the stdio bridge, use an absolute repository path, run `bun install`, check `bun run mcp:stdio --help`, and restart the client. |
| Search has no results / file not found | Complete a repository scan; file context comes from the index and can lag the live branch. |
| Scan fails | Open `/api/health` first. Then verify GitHub installation access, Gemini key/quota, callback secret equality, and scan-job diagnostics. |
| MCP key creation says storage/config is unavailable | Apply current Prisma migrations/schema and provide a valid `MCP_API_KEY_SECRET`. |
| Build fails on environment validation | Compare variable names with `.env.example`; optional integrations may still have routes that require their secrets when invoked. |

## Validation and contribution

```bash
bun run lint
bun run typecheck
bun test
bun run build
python -m compileall -q ai-backend
```

For Python dependency-isolated work, create the virtual environment above and add focused tests before changing scanning or retrieval. Keep migrations additive, never commit secrets or generated Prisma output, and update [the MCP reference](docs/MCP_REFERENCE.md) whenever tool schemas change. Open a focused pull request explaining behavior, tests, migration impact, and operational changes.

## Current limitations and follow-up work

- The `npx context-compiler-mcp connect` installer (`packages/mcp`) must be published to npm before the one-command flow works for others; until then, use the per-agent commands in the setup dialog.
- The MCP surface has tools only—no resources, prompts, subscriptions, or write operations.
- Self-hosting still needs a hosted Supabase project for sign-in and a GitHub App for repository import. The Compose file and web Dockerfile have not yet been built in CI.
- Indexed content can be stale until a scan completes. Feature-flow and Q&A outputs are retrieval/model-assisted and should be verified before edits.
- External integration tests require credentials and live services and are not safe to run by default.
- Billing exists in code but is optional; production pricing/entitlements should be reviewed by each operator rather than inferred from this README.

## License

The repository currently contains no tracked license file. Treat the code as unlicensed until the owner adds one; the previous README's MIT claim was not verifiable from the repository.
