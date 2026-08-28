# MCP reference

The MCP entry point is `src/mcp/server.ts`. It implements **stdio only** and is read-only. A key binds one server process to one repository and workspace. There are no MCP resources or prompts in this release; repository access is exposed through the five tools below. All tools return MCP text content plus `structuredContent`; failures return `isError: true` with an actionable message.

Common optional filters are `language`, `fileCategory`, and `pathPrefix` (non-empty strings when supplied). Results depend on the latest successful repository scan. Every request requires `CONTEXT_COMPILER_BASE_URL` and a valid repository-bound `CONTEXT_COMPILER_MCP_KEY`.

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

The bridge first calls `GET /api/mcp/session` to validate its key, then calls the corresponding authenticated web route. HTTP errors use the server's message; network, timeout, non-JSON, and wrong-base-URL cases are converted to safe tool errors. The key is sent only as a Bearer header. The default request timeout is 15 seconds and can be set from 1–120 seconds with `CONTEXT_COMPILER_TIMEOUT_MS`.
