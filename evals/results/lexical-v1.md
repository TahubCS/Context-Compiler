# Retrieval eval: lexical-v1

Base URL: `http://127.0.0.1:3100` · k = 5 · 2026-10-14T20:50:50.876Z

| Dataset | Layout | Questions | Hit@5 | Recall@5 | MRR | Pack recall | Pack tokens | Latency |
|---|---|---|---|---|---|---|---|---|
| rails-realworld | Ruby on Rails | 18 | 94% | 94% | 0.66 | 94% | 2320 | 53 ms |
| express-prisma-realworld | Express + Prisma (TypeScript) | 21 | 95% | 95% | 0.71 | 95% | 4383 | 62 ms |
| django-realworld | Django + DRF | 22 | 95% | 95% | 0.80 | 95% | 5025 | 48 ms |
| context-compiler | Next.js + FastAPI + Prisma | 22 | 91% | 86% | 0.74 | 86% | 6680 | 81 ms |
| go-gin-realworld | Go + Gin + GORM | 21 | 95% | 95% | 0.71 | 95% | 8532 | 63 ms |
| **overall** | | 104 | 94% | 93% | 0.73 | 93% | 5485 | 62 ms |

## By question kind

| Kind | Questions | Hit@5 | Recall@5 | MRR |
|---|---|---|---|---|
| nl | 92 | 93% | 92% | 0.72 |
| task | 5 | 100% | 100% | 0.63 |
| symbol | 7 | 100% | 100% | 0.86 |

## Misses (expected file not in the top 5)

- **rails-realworld-11** "How is login handled?" expected `app/controllers/sessions_controller.rb`; got `config/routes.rb`, `app/controllers/follows_controller.rb`, `config/application.rb`, `app/controllers/application_controller.rb`, `app/controllers/articles_controller.rb`
- **express-prisma-realworld-17** "Where is the current user's profile updated?" expected `src/app/routes/auth/auth.service.ts`; got `src/app/routes/profile/profile.utils.ts`, `src/app/routes/profile/profile.service.ts`, `src/app/routes/profile/profile.controller.ts`, `src/app/routes/profile/profile.model.ts`, `src/app/routes/auth/auth.controller.ts`
- **django-realworld-13** "How are JSON responses wrapped in a top-level key like user or article?" expected `conduit/apps/core/renderers.py`; got `conduit/apps/articles/views.py`, `conduit/apps/articles/models.py`, `conduit/apps/articles/renderers.py`, `conduit/apps/authentication/renderers.py`, `conduit/apps/articles/serializers.py`
- **context-compiler-01** "How are MCP API keys authenticated on requests?" expected `src/lib/mcp-request.ts`, `src/lib/db/mcp-api-keys.ts`; got `src/app/api/repo/[repoId]/mcp-keys/route.ts`, `src/lib/mcp-request.ts`, `src/app/api/mcp/session/route.ts`, `src/app/api/repo/[repoId]/mcp-keys/[keyId]/route.ts`, `src/app/api/mcp/answer/route.ts`
- **context-compiler-02** "Where are MCP API keys hashed?" expected `src/lib/crypto.ts`; got `src/lib/db/mcp-api-keys.ts`, `src/app/api/repo/[repoId]/mcp-keys/route.ts`, `src/app/api/mcp/session/route.ts`, `src/app/api/repo/[repoId]/mcp-keys/[keyId]/route.ts`, `src/lib/mcp-request.ts`
- **context-compiler-10** "How are GitHub tokens encrypted at rest?" expected `src/lib/crypto.ts`; got `src/lib/github-repository-refs.ts`, `src/lib/github-app.ts`, `src/lib/github-repo-sync.ts`, `src/app/api/github-app/install/route.ts`, `src/app/api/github-app/webhook/route.ts`
- **context-compiler-21** "How does the app pick the active workspace for a user?" expected `src/lib/db/workspaces.ts`, `src/lib/app-context.ts`; got `src/app/api/workspaces/active/route.ts`, `src/lib/app-context.ts`, `src/components/features/app-top-nav.tsx`, `src/app/api/github-app/link/route.ts`, `src/app/api/github-app/callback/route.ts`
- **go-gin-realworld-13** "How are validation errors converted into the API error format?" expected `common/utils.go`; got `api/run-api-tests.sh`, `api/Conduit.postman_collection.json`, `users/routers.go`, `articles/routers.go`, `scripts/run-api-tests.sh`
