# MCP reference

Context Compiler serves MCP two ways, with the same tools (defined in `src/mcp/tools.ts`): a remote **Streamable HTTP** endpoint at `<base-url>/api/mcp` (`src/app/api/mcp/route.ts`, stateless, JSON responses) and a local **stdio** bridge (`src/mcp/server.ts`). Both are read-only. There are no MCP resources or prompts in this release; repository access is exposed through the six tools below. All tools return MCP text content plus `structuredContent`; failures return `isError: true` with an actionable message.

## Keys and repository selection

Every request needs a key: an `Authorization: Bearer ccmcp_...` header for the remote endpoint, or `CONTEXT_COMPILER_MCP_KEY` (plus `CONTEXT_COMPILER_BASE_URL`) for the stdio bridge. There are two kinds, both created on a repository's **Use With Agent** dialog:

- **Repository key**: reads one repository. Tools use it automatically; asking for another repository is refused.
- **Workspace key**: reads every non-archived repository in the workspace, so one registration covers all of them. Each call picks the repository from, in order:
  1. the tool's `repository` argument (`owner/name`; GitHub URLs and SSH remotes are accepted too),
  2. the client's `X-Context-Compiler-Repository` header (a per-project default), or, for the stdio bridge, `CONTEXT_COMPILER_REPOSITORY` or the `origin` remote of the folder the client started it in,
  3. the workspace's only repository, if it has exactly one.

  Otherwise the tool returns an error listing the available repositories.

Every repository tool takes the optional `repository` argument plus the filters `language`, `fileCategory`, and `pathPrefix` (non-empty strings when supplied). Results depend on the latest successful scan. All tools carry `readOnlyHint: true`.

## `list_repositories`

No input. Returns the key's scope (`repository` or `workspace`), the workspace, and each repository with its scan status and last indexed commit. Agents use it to find the `repository` value for other tools.

## `search_codebase`

Find implementation and declaration context using hybrid semantic/lexical retrieval.

| Input | Type | Rules |
|---|---|---|
| `query` | string | Required; at least 1 character. |
| `language`, `fileCategory`, `pathPrefix` | string | Optional filters. `pathPrefix` is a repository-relative prefix. |
| `limit` | integer | Optional; 1–10. |

Output: repository metadata, query, best match, likely declaration site, related files, file-grouped results, and duplicate count. Each result includes its path, indexed chunk range, content and ranking metadata. Example: `{"query":"authenticateMcpRequest","limit":5}`. Empty indexes return an empty result set. Authentication, retrieval, upstream AI, timeout, and malformed-response failures are reported as tool errors.

## `answer_repo_question`

Answer a repository question from retrieved indexed context.

| Input | Type | Rules |
|---|---|---|
| `question` | string | Required; at least 1 character. |
| `language`, `fileCategory`, `pathPrefix` | string | Optional filters. |
| `limit` | integer | Optional; 1–10. |

Output: grounded answer, citations, selected files, confidence (`high`, `medium`, or `low`), missing context, and `needsVerification`. Example: `{"question":"How are MCP keys authenticated?"}`. Generation can degrade to an extractive fallback; it does not prove correctness beyond indexed context.

## `get_file_context`

Retrieve and stitch indexed chunks for one exact file.

| Input | Type | Rules |
|---|---|---|
| `filePath` | string | Required; 1–1024 characters; relative; no `..`; must not start `/`. |
| `startChunkIndex` | integer | Optional; at least 0. |
| `maxChunks` | integer | Optional; 1–24. |

Output: repository metadata and a file object with path, language/category, stitched content, returned range, total chunk count, and individual chunks. Example: `{"filePath":"src/mcp/server.ts","maxChunks":8}`. A missing/unindexed path is an error. This reads the index, not the live Git checkout.

## `build_context_pack`

Build a prompt-ready, ranked working set for a task.

| Input | Type | Rules |
|---|---|---|
| `task` | string | Required; at least 1 character. |
| `language`, `fileCategory`, `pathPrefix` | string | Optional filters. |
| `maxSnippets` | integer | Optional; 1–10. |

Output: formatted pack, snippets, selected/start-here files, task summary, selection reasons, duplicate count, and retrieval mode. Example: `{"task":"Add request timeouts to the MCP bridge","maxSnippets":6}`. Output is bounded by indexed chunks, not an entire-file guarantee.

## `trace_feature_flow`

Infer a likely read order across entrypoint, orchestration, persistence, and integrations.

| Input | Type | Rules |
|---|---|---|
| `query` | string | Required; at least 1 character. |
| `language`, `fileCategory`, `pathPrefix` | string | Optional filters. |
| `mode` | enum | Optional: `auto`, `feature`, `symbol`, or `route`. |

Output: repository/query, possible entrypoint, categorized files, read order, missing links, and supporting results. Example: `{"query":"repository scan callback","mode":"route"}`. This is retrieval-based inference and explicitly reports unresolved links.

## Protocol and errors

The remote endpoint authenticates each request and returns 401 with `WWW-Authenticate: Bearer` when the key is missing or revoked; tool failures are returned as `isError` results. The stdio bridge connects immediately and calls the corresponding authenticated web route per tool (`/api/mcp/search`, `/answer`, `/file`, `/context-pack`, `/trace`, `/repositories`), sending its detected default repository as `X-Context-Compiler-Repository`; `doctor` calls `GET /api/mcp/session` and prints the key's scope and repositories. HTTP errors use the server's message; network, timeout, non-JSON, and wrong-base-URL cases are converted to safe tool errors. The key is sent only as a Bearer header. The default request timeout is 60 seconds and can be set from 1–120 seconds with `CONTEXT_COMPILER_TIMEOUT_MS`.
