# Context Compiler — plan to a working "C grade"

Written 2026-10-14 from a full read of the repo at `6b6a0f8`.

## What "C grade" means here

A developer who isn't you can:

1. Sign in, connect a repo, and get a finished scan.
2. Connect Claude Code, Codex, or Gemini CLI with **one command**, without cloning this repo.
3. Ask their agent about the code and get the right files back for most questions, on **any** repo layout, not just this one.
4. Trust that it doesn't leak code or burn your Gemini quota.

And you can show this with numbers from an eval run, not from agents saying it's good.

Out of scope for C (these come later, see the end): local-only mode, a VS Code extension, symbol graphs, multiple embedding providers, billing polish.

---

## Where the project stands

**Works today:** GitHub OAuth and App login, repo sync, webhook auto-scan on push, incremental scans with heartbeat recovery, hybrid pgvector + lexical search, grounded answers with a fallback, context packs, file context, per-repo hashed MCP keys, workspaces, saved carts and answers. `tsc` and `eslint` pass.

**Blocking problems I found (all checked in the code):**

| # | Problem | Where | Effect |
|---|---|---|---|
| B1 | The AI backend has **no auth**. `/scan`, `/search`, `/answer` and `/embed` are open, and the Dockerfile binds `0.0.0.0:8080` (it's deployed on Fly). | `ai-backend/main.py` | Anyone who finds the URL can read any indexed repo by `repository_id`, spend your Gemini quota, or make the backend clone an arbitrary URL and POST to an arbitrary callback. |
| B2 | The MCP bridge exits if the web app can't be reached at startup (`ensureSession()` runs before `server.connect`). | `src/mcp/server.ts` `main()` | Clients show the server as "failed" or "offline" instead of connected with a readable error. I reproduced this: exit code 1. |
| B3 | Bridge timeout is 15s by default, but `/answer` waits up to 30s for the backend and Gemini retries can take minutes. | `server.ts`, `repository-retrieval.ts:535,638`, `ai.py` | `answer_repo_question` often times out on the client side. |
| B4 | File-role ranking is hardcoded to **this repo's** layout (`src/lib/db/`, `prisma/`, `ai-backend/`, `stripe|billing|supabase`). | `repository-retrieval.ts` `classifyFileRole` | `trace_feature_flow` and the ranking boosts mean nothing on Django, Go, Rails, monorepos and so on. Results look good when you test on this repo, but that's the only repo they work on. |
| B5 | The HNSW index is shared across all repos, and the query filters by `repositoryId` *after* the ANN search (pgvector's default `ef_search` is 40). | `vector_store.py` `_semantic_candidates`, migration `0001` | Once several repos are indexed, a small repo can get few or no semantic hits. |
| B6 | Embeddings don't set a task type (query vs document). | `ai.py` `embed_text` | Retrieval quality is noticeably worse than it needs to be. |
| B7 | `async def` FastAPI handlers call the synchronous Gemini client and psycopg. | `main.py` | One slow request blocks every other search. |
| B8 | `bun test` fails: `scan-jobs.test.ts` imports Prisma, which throws when `DATABASE_URL` is missing. There are no Python tests and no CI. | `src/lib/db/scan-jobs.test.ts` | Nothing guards against regressions. |
| B9 | The Prisma schema declares `@@index([embedding])` while migration 0001 builds an HNSW index, and the README recommends `prisma db push`. | `schema.prisma:294` | `db push` can drift from or replace the vector index. |

**The MCP registration problem you mentioned:** right now connecting an agent means cloning this whole Next.js repo, running `bun install` (776 packages), typing your local path into the web dialog, pasting a key, and running a command that hardcodes that path. You need one MCP server per repo. There's no remote endpoint, so nothing can register itself automatically. The dialog also has small errors: it says `claude mcp add` writes to `~/.claude/settings.json` (user scope actually goes to `~/.claude.json`), and it says "Four tools" while listing five.

---

## Phase 0 — Fix the blockers (do first, about 2–3 days)

- [ ] **B1. Lock down the AI backend.** Require `Authorization: Bearer $AI_BACKEND_SECRET` on every route except `/health`, using `hmac.compare_digest`. Send it from `scan-dispatch.ts` and `repository-retrieval.ts`. Allow-list `github_url` to `https://github.com/` and `callback_url` to `APP_BASE_URL`. Switch the callback-secret check in `scan/status/route.ts` to a constant-time compare.
- [ ] **B7.** Change the blocking handlers to plain `def` so FastAPI runs them in its threadpool. It's a one-word change per handler.
- [ ] **B3.** Raise the bridge's default timeout to 60s. Give `/answer` a hard time limit on the backend (about 25s), then return the extractive fallback with `degraded: true` instead of retrying for minutes. For interactive requests, cut Gemini retries to 1–2.
- [ ] **B8.** Make `prisma.ts` connect lazily, on first use rather than at import. Then `bun test` passes without a database.
- [ ] **B9.** Remove the btree `@@index([embedding])` from the schema, tell people to use `prisma migrate deploy`, and keep the HNSW index in SQL only.
- [ ] Add `.github/workflows/ci.yml` that runs lint, typecheck, `bun test`, and `python -m compileall` plus pytest.

## Phase 1 — MCP you can install in one command (your priority, about 1 week)

The goal: **no clone, no local path, no key pasting, one registration that covers every repo.**

### 1a. Remote MCP endpoint (most of the fix)
- [ ] Add a **Streamable HTTP** MCP route at `src/app/api/mcp/route.ts`, using `@modelcontextprotocol/sdk`'s `WebStandardStreamableHTTPServerTransport` in stateless mode, which works in Next route handlers. Move the five tool definitions out of `server.ts` into `src/mcp/tools.ts`, so the HTTP route and the stdio bridge share them. Have the HTTP route call the `repository-retrieval.ts` functions directly instead of making HTTP calls to itself.
- [ ] Authenticate with `Authorization: Bearer ccmcp_...` through the existing `authenticateMcpRequest`. Return 401 with a `WWW-Authenticate` header so clients show "needs auth" rather than "offline".
- [ ] After this, registration is a single line with nothing to clone:
  ```bash
  claude mcp add --transport http context-compiler https://APP/api/mcp --header "Authorization: Bearer ccmcp_..."
  codex mcp add context-compiler --url https://APP/api/mcp --bearer-token-env-var CONTEXT_COMPILER_MCP_KEY
  gemini mcp add --transport http context-compiler https://APP/api/mcp -H "Authorization: Bearer ccmcp_..."
  ```
  Check each flag against the current CLI docs when you build this; these CLIs change often.

### 1b. One key for all repos, with the repo picked automatically
- [ ] Add a nullable `McpApiKey.repositoryId` plus a `scope` column (`repository | workspace`). A workspace key can reach every repo in that workspace.
- [ ] Every tool takes an optional `repository` argument (`owner/name`). If it's left out: use the key's bound repo, or the only repo in the workspace, or return an error listing the available repos. Add a `list_repositories` tool so the agent can find out for itself.
- [ ] The stdio bridge (kept for local use) reads `git remote get-url origin` in the agent's working directory and sends that as the default `repository`. That makes **one global registration work in every repo you open**, which is the autonomous behaviour you're after.

### 1c. `npx` installer and `connect` command
- [ ] Publish the bridge as a small npm package (`packages/mcp`, depending only on the MCP SDK and zod) with a `bin` entry, so `npx -y context-compiler-mcp` works without this repo.
- [ ] Add `npx context-compiler-mcp connect --url https://APP`, which:
  1. Opens the browser to `/connect?code=XYZ`, a device-code page where you sign in and pick the workspace or repo. The page mints a key and hands it back to the CLI through a polling endpoint, so you never copy and paste a key.
  2. Checks which agent CLIs are installed (`claude`, `codex`, `gemini` on PATH) and runs each one's own `mcp add` command, which is better than editing their config files by hand. It falls back to editing `~/.codex/config.toml` or `~/.gemini/settings.json` directly only when a CLI has no `add` command.
  3. Supports `--project`, which writes `.mcp.json` (Claude) at the repo root, using an env-var reference instead of the literal key so it's safe to commit.
  4. Runs `doctor` against the remote endpoint and prints the tool list.
- [ ] Add `npx context-compiler-mcp doctor` and `... disconnect`, which removes the server from each CLI and revokes the key.

### 1d. Bridge resilience
- [ ] Always `connect()` the stdio transport first, then check the session lazily on the first tool call. If the app is unreachable, each tool returns a clear `isError` result ("Context Compiler at X is unreachable; run `doctor`") instead of the process dying.
- [ ] Report the bridge's real version: it currently says `0.5.2` while `package.json` says `0.1.0`.

### 1e. Rewrite the web "Use With Agent" dialog
- [ ] Make the default tab **"One command"** showing `npx context-compiler-mcp connect --url <this app>`. Below it, show per-CLI remote commands with the key filled in. Move stdio and a local clone to an "Advanced" tab. Remove the local-path input and fix the copy errors listed above.

### 1f. OAuth (optional, B-grade)
- [ ] Claude Code and other clients support MCP OAuth for remote servers. Adding `/.well-known/oauth-protected-resource` plus an authorization server on top of Supabase auth would replace keys completely. The device-code flow in 1c gets most of the user experience at about a fifth of the cost, so do this later.

## Phase 2 — Correct results on any repo (about 1–1.5 weeks)

Without measurement, "correct" is just a feeling. Build the measurement first.

- [ ] **Eval harness first.** Add `evals/` with 3–5 pinned public repos in different languages and layouts, for example a Next.js app, a Django app, a Go service, and a monorepo. Write 20–30 questions per repo, each with the files that should come back (`{"q": "where are sessions validated?", "expect": ["auth/middleware.go"]}`). A script `bun run eval` calls search and context-pack and reports **Recall@5, MRR, and tokens returned**. Track the numbers in `evals/RESULTS.md`. **C-grade bar: Recall@5 ≥ 0.7 on every repo.**
- [ ] **B4. Generic file roles.** Replace `classifyFileRole` with heuristics that work across ecosystems:
  - Entrypoints: `routes/`, `controllers/`, `handlers/`, `cmd/`, `main.*`, `app.*`, `urls.py`, `views.py`, Next or Remix `page|route`.
  - Persistence: `models/`, `migrations/`, `schema.*`, `repositories/`, `dao`, `*.sql`, ORM files.
  - Integrations: `clients/`, `adapters/`, `integrations/`, plus import-based hints for HTTP and SDK clients.

  Have the scanner compute the role once and store it in `CodeDocument.metadata`. Re-tune the score weights against the eval set, not against this repo.
- [ ] **B6.** Use `task_type=RETRIEVAL_DOCUMENT` when embedding chunks and `RETRIEVAL_QUERY` for queries. Changing this requires re-embedding, so bump `CURRENT_INDEX_FORMAT_VERSION` to 3 to force a full rescan.
- [ ] **Batch embeddings** in the scanner by sending many chunks per `embed_content` call. Scans currently make one call per chunk with a 5s backoff, which is slow and the main reason rate limits get hit.
- [ ] **B5.** Make the ANN search filter correctly per repo. Short term: `SET LOCAL hnsw.ef_search = 200` and `hnsw.iterative_scan = relaxed_order` (pgvector ≥ 0.8). If that's not available, oversample (`LIMIT k*10`) inside a CTE. Write a test that indexes two repos and checks the small one still gets hits.
- [ ] **Lexical search:** replace `lower(content) LIKE '%x%'` with a `tsvector` GIN index plus `pg_trgm` for symbols, and escape `%` and `_` in `pathPrefix`.
- [ ] **Chunking:** keep the regex chunker but attach the enclosing symbol name and the file's import lines to each chunk's metadata, and use them in lexical matching. Tree-sitter is a B-grade item.
- [ ] Add Python tests (pytest) for chunking, incremental diff resolution, and the filters in `search_hybrid_chunks`, using a throwaway Postgres (pgvector docker image) in CI.

## Phase 3 — Actually useful to an agent (about 1 week)

This is where token savings and agent help become real and measurable.

- [ ] **Token budgets.** Add `maxTokens` (default about 6k) to `build_context_pack` and `search_codebase`. Pack whole functions by score until the budget runs out. Store a real token estimate (chars/4 is fine) instead of the current whitespace word count. Return `tokensUsed` and `tokensSavedVsFullFiles`, which gives you a number you can actually show users.
- [ ] **Staleness.** Every response includes `indexedCommitSha` and `indexedAt`. The stdio bridge compares that with the local `git rev-parse HEAD` and warns, for example "index is 14 commits behind your checkout; files X, Y changed locally", using `git diff --name-only`. Agents then know when to read a file from disk instead.
- [ ] **Better tool descriptions.** Agents decide whether to call a tool based almost entirely on its description. Rewrite each one to say *when* to use it ("Use before editing an unfamiliar area: returns the smallest set of files…") and add `annotations: { readOnlyHint: true }`.
- [ ] **Add an MCP prompt and resource.** Add a `repo-overview` resource, an auto-generated summary of the top-level layout, entrypoints and stack built at scan time. Add a `/context-compiler:plan-change` prompt that runs `build_context_pack` and then `trace_feature_flow`.
- [ ] **Trigger scans from the agent.** Add a `request_rescan` tool, behind a separate key permission, so an agent that notices staleness can ask for a fresh index.
- [ ] **Usage log.** Record each tool call (tool, latency, result count, tokens returned) per key, and show it in the repo page, so you can see whether agents use it and how much context they save.

## Phase 4 — Something another person can run (about 3–4 days)

- [ ] `docker-compose.yml` with pgvector Postgres, the AI backend, and the web app, plus a `bun run setup` script that generates the secrets and checks every required env var. Add a `/api/health` route that checks the DB, the backend (with its auth), Gemini, and GitHub App config.
- [ ] A Dockerfile for the Next app, or documented Vercel settings. Document the Fly deployment you're already running (`fly.toml` isn't in the repo).
- [ ] One end-to-end smoke test: scan a small fixture repo, then `doctor`, then call each MCP tool, against compose in CI. Gemini can be stubbed with a fake embedder that returns deterministic vectors.
- [ ] Add a LICENSE file. The README notes it's missing, and nobody can legally adopt the project without one.
- [ ] Update the README quick start to the `npx … connect` flow, and update `docs/MCP_REFERENCE.md` for HTTP transport, workspace keys and the new tools.

---

## Suggested order and checkpoints

1. **Phase 0** → CI green, backend locked down. *(Checkpoint: nothing public is open.)*
2. **Phase 1a + 1d + 1e** → remote endpoint live; Claude Code and Codex connect with one pasted command. *(Checkpoint: connect from a fresh machine with nothing cloned.)*
3. **Phase 2 eval harness** → first baseline numbers, which will probably be poor on non-Next repos.
4. **Phase 2 fixes** → Recall@5 ≥ 0.7 across all eval repos.
5. **Phase 1b + 1c** → `npx context-compiler-mcp connect` and workspace keys. *(Checkpoint: one registration works across every repo you open.)*
6. **Phase 3**, then **Phase 4**.

**C grade = steps 1–5 done, plus token budgets and staleness from Phase 3.**

## After C (B/A ideas, not now)

Tree-sitter chunking plus a symbol and call graph (real `trace_feature_flow`), local-only mode (index the working tree with a local embedder, no cloud), MCP OAuth, a VS Code extension, multiple embedding providers (OpenAI, Voyage, Ollama), PR-aware context ("what does this diff touch?"), and published benchmarks showing token savings against plain grep agents.
