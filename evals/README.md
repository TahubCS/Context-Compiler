# Retrieval evals

Measures whether Context Compiler returns the right files for real developer questions, on repositories with different layouts. Questions go through the remote MCP endpoint (`/api/mcp`) exactly as an agent would send them.

## Datasets

`datasets/*.json`: one file per repository, pinned to a commit. Each question lists the files that answer it (`expect`) and a `kind`:

- `nl`: a natural-language question ("Where are JWT tokens generated?")
- `symbol`: an identifier ("AuthMiddleware")
- `task`: a change request ("Add a length limit on bio…"); the expected files are where the change goes

| Dataset | Layout | Questions |
|---|---|---|
| django-realworld | Django + DRF | 22 |
| go-gin-realworld | Go + Gin + GORM | 21 |
| express-prisma-realworld | Express + Prisma (TypeScript) | 21 |
| rails-realworld | Ruby on Rails | 18 |
| context-compiler | Next.js + FastAPI + Prisma (this repo at `6b6a0f8`) | 22 |

The four RealWorld apps implement the same spec, so the same question can be compared across frameworks. They are small (40–110 files), which makes ranking easier than on a large codebase; treat these scores as an upper bound until larger repositories are added.

## Metrics

Over the distinct files `search_codebase` returns, in rank order:

- **Hit@5**: at least one expected file is in the top 5
- **Recall@5**: share of expected files in the top 5. The C-grade bar in `docs/PLAN.md` is **70% on every dataset**.
- **MRR**: 1 / rank of the first expected file
- **Pack recall / tokens**: expected files among `build_context_pack`'s selected files, and the size of the pack text an agent receives (chars / 4)

## Running

Against a deployment: import each dataset's repository in the UI, create a key per repository, and write them to `evals/keys.local.json` (gitignored):

```json
{ "django-realworld": "ccmcp_...", "context-compiler": "ccmcp_..." }
```

Then:

```bash
EVAL_BASE_URL=https://your-app bun run eval --label gemini-baseline
```

Fully local, with no Gemini key, using the deterministic `hash` embedder (scores are a lower bound for semantic questions):

```bash
# AI backend
EMBEDDING_PROVIDER=hash AI_BACKEND_SECRET=... DATABASE_URL=... uvicorn main:app --port 8000
# web app: DATABASE_URL, MCP_API_KEY_SECRET, AI_BACKEND_URL, AI_BACKEND_SECRET, AI_CALLBACK_SECRET set
bun run build && bun run start
# scan the pinned commits and create keys, then evaluate
EVAL_APP_URL=http://127.0.0.1:3000 bun run eval:setup-local
EVAL_BASE_URL=http://127.0.0.1:3000 bun run eval --label local
```

Each run writes `results/<label>.md` (summary and every miss) and `results/<label>.json`.
