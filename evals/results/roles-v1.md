# Retrieval eval: roles-v1

Base URL: `http://127.0.0.1:3100` · k = 5 · 2026-10-14T20:47:16.816Z

| Dataset | Layout | Questions | Hit@5 | Recall@5 | MRR | Pack recall | Pack tokens | Latency |
|---|---|---|---|---|---|---|---|---|
| rails-realworld | Ruby on Rails | 18 | 78% | 78% | 0.53 | 89% | 2375 | 49 ms |
| express-prisma-realworld | Express + Prisma (TypeScript) | 21 | 90% | 88% | 0.60 | 83% | 4224 | 53 ms |
| django-realworld | Django + DRF | 22 | 82% | 75% | 0.60 | 75% | 3729 | 49 ms |
| context-compiler | Next.js + FastAPI + Prisma | 22 | 64% | 61% | 0.52 | 59% | 5637 | 66 ms |
| go-gin-realworld | Go + Gin + GORM | 21 | 86% | 83% | 0.60 | 79% | 6854 | 51 ms |
| **overall** | | 104 | 80% | 77% | 0.57 | 76% | 4629 | 54 ms |

## By question kind

| Kind | Questions | Hit@5 | Recall@5 | MRR |
|---|---|---|---|---|
| nl | 92 | 78% | 76% | 0.55 |
| task | 5 | 80% | 60% | 0.33 |
| symbol | 7 | 100% | 100% | 1.00 |

## Misses (expected file not in the top 5)

- **rails-realworld-01** "Where are JWT tokens generated?" expected `app/models/user.rb`; got `app/controllers/application_controller.rb`, `db/schema.rb`, `app/views/users/_user.json.jbuilder`, `.gitignore`, `config.ru`
- **rails-realworld-02** "How are requests authenticated with the Authorization header?" expected `app/controllers/application_controller.rb`; got `app/models/user.rb`, `app/views/profiles/show.json.jbuilder`, `app/views/users/show.json.jbuilder`, `app/views/articles/show.json.jbuilder`, `db/schema.rb`
- **rails-realworld-05** "How does following a user work?" expected `app/controllers/follows_controller.rb`; got `app/controllers/users_controller.rb`, `app/views/users/show.json.jbuilder`, `app/views/profiles/show.json.jbuilder`, `app/views/users/_user.json.jbuilder`, `app/models/user.rb`
- **rails-realworld-11** "How is login handled?" expected `app/controllers/sessions_controller.rb`; got `app/models/follow.rb`, `app/views/articles/show.json.jbuilder`, `app/views/users/show.json.jbuilder`, `app/views/profiles/show.json.jbuilder`, `db/schema.rb`
- **express-prisma-realworld-10** "Where are unauthorized JWT errors turned into 401 responses?" expected `src/main.ts`; got `src/app/routes/auth/auth.service.ts`, `src/app/routes/article/article.service.ts`, `src/app/routes/profile/profile.service.ts`, `src/app/routes/tag/tag.service.ts`, `src/app/models/http-exception.model.ts`
- **express-prisma-realworld-12** "What does the database schema for articles and tags look like?" expected `src/prisma/schema.prisma`; got `src/prisma/seed.ts`, `src/prisma/prisma-client.ts`, `src/app/routes/auth/user.model.ts`, `src/app/models/http-exception.model.ts`, `src/app/routes/tag/tag.service.ts`
- **express-prisma-realworld-18** "Add pagination to the comments of an article" expected `src/app/routes/article/article.service.ts`, `src/app/routes/article/article.controller.ts`; got `src/app/routes/auth/user.model.ts`, `src/app/routes/article/article.service.ts`, `src/app/routes/article/article.model.ts`, `src/app/routes/article/comment.model.ts`, `src/prisma/seed.ts`
- **django-realworld-06** "How does a user favorite an article?" expected `conduit/apps/articles/views.py`, `conduit/apps/profiles/models.py`; got `conduit/apps/authentication/signals.py`, `conduit/apps/profiles/models.py`, `conduit/apps/articles/models.py`, `conduit/apps/core/renderers.py`, `conduit/apps/articles/signals.py`
- **django-realworld-08** "When is a profile created for a new user?" expected `conduit/apps/authentication/signals.py`; got `conduit/apps/profiles/models.py`, `conduit/apps/profiles/serializers.py`, `conduit/apps/profiles/views.py`, `conduit/apps/profiles/renderers.py`, `conduit/apps/profiles/urls.py`
- **django-realworld-10** "Where is the feed of articles from followed users built?" expected `conduit/apps/articles/views.py`; got `conduit/apps/authentication/signals.py`, `conduit/apps/articles/signals.py`, `conduit/apps/articles/models.py`, `conduit/apps/authentication/models.py`, `conduit/apps/articles/__init__.py`
- **django-realworld-11** "How does following another user work?" expected `conduit/apps/profiles/models.py`, `conduit/apps/profiles/views.py`; got `conduit/apps/authentication/signals.py`, `conduit/apps/core/exceptions.py`, `conduit/apps/core/renderers.py`, `conduit/apps/profiles/views.py`, `conduit/wsgi.py`
- **django-realworld-18** "Add a reading time field to articles" expected `conduit/apps/articles/models.py`, `conduit/apps/articles/serializers.py`; got `conduit/apps/core/models.py`, `conduit/apps/articles/signals.py`, `conduit/apps/authentication/signals.py`, `conduit/apps/articles/models.py`, `conduit/apps/profiles/models.py`
- **django-realworld-19** "Where are comments deleted?" expected `conduit/apps/articles/views.py`; got `conduit/apps/articles/models.py`, `conduit/apps/articles/renderers.py`, `conduit/apps/core/renderers.py`, `conduit/apps/core/__init__.py`, `conduit/apps/profiles/models.py`
- **django-realworld-21** "How is the favorites count for an article calculated?" expected `conduit/apps/articles/serializers.py`; got `conduit/apps/authentication/signals.py`, `conduit/apps/authentication/models.py`, `conduit/apps/authentication/renderers.py`, `conduit/apps/authentication/__init__.py`, `conduit/apps/authentication/serializers.py`
- **context-compiler-02** "Where are MCP API keys hashed?" expected `src/lib/crypto.ts`; got `src/lib/mcp-request.ts`, `src/lib/db/mcp-api-keys.ts`, `src/app/api/mcp/session/route.ts`, `src/app/api/repo/[repoId]/mcp-keys/route.ts`, `src/app/api/repo/[repoId]/mcp-keys/[keyId]/route.ts`
- **context-compiler-05** "Where are embeddings generated?" expected `ai-backend/ai.py`; got `src/components/ui/scroll-area.tsx`, `src/components/ui/textarea.tsx`, `src/lib/repository-retrieval.ts`, `src/lib/mcp-request.ts`, `src/lib/github-repository-refs.ts`
- **context-compiler-06** "How does hybrid semantic and lexical search work?" expected `ai-backend/vector_store.py`; got `src/lib/repository-retrieval.ts`, `src/app/(public)/page.tsx`, `src/mcp/server.ts`, `ai-backend/main.py`, `src/app/api/mcp/search/route.ts`
- **context-compiler-10** "How are GitHub tokens encrypted at rest?" expected `src/lib/crypto.ts`; got `src/lib/github-repository-refs.ts`, `src/lib/github-app.ts`, `src/lib/github-repo-sync.ts`, `src/components/features/github-sign-in-button.tsx`, `src/app/api/github-app/install/route.ts`
- **context-compiler-11** "How are search results re-ranked and deduplicated for agents?" expected `src/lib/repository-retrieval.ts`; got `src/components/features/repo/search-pane.tsx`, `src/app/api/mcp/search/route.ts`, `src/app/api/repo/[repoId]/search/route.ts`, `src/components/ui/textarea.tsx`, `src/components/ui/scroll-area.tsx`
- **context-compiler-16** "How is the grounded answer generated with model fallbacks?" expected `ai-backend/ai.py`; got `src/lib/db/answer-sessions.ts`, `src/components/features/repo/answer-rich-text.tsx`, `src/app/api/repo/[repoId]/answers/[answerId]/export/route.ts`, `src/app/api/repo/[repoId]/answer/route.ts`, `src/app/api/repo/[repoId]/answers/[answerId]/route.ts`
- **context-compiler-19** "Add a rate limit to the MCP search endpoint" expected `src/app/api/mcp/search/route.ts`; got `src/lib/mcp-request.ts`, `src/lib/repository-retrieval.ts`, `src/lib/db/mcp-api-keys.ts`, `src/lib/db/code-documents.ts`, `ai-backend/vector_store.py`
- **context-compiler-20** "Where is the incremental scan diff computed?" expected `ai-backend/scanner.py`; got `src/lib/scan-dispatch.ts`, `src/lib/scan-auth.ts`, `src/lib/db/scan-jobs.ts`, `src/components/features/repositories/scan-status-badge.tsx`, `src/components/features/repo/scan-trigger-button.tsx`
- **context-compiler-21** "How does the app pick the active workspace for a user?" expected `src/lib/db/workspaces.ts`, `src/lib/app-context.ts`; got `src/lib/app-context.ts`, `src/app/(app)/layout.tsx`, `src/app/api/repo/[repoId]/scan/route.ts`, `src/app/api/notifications/route.ts`, `src/app/api/github/route.ts`
- **go-gin-realworld-09** "Where are the article routes registered?" expected `articles/routers.go`; got `users/middlewares.go`, `articles/models.go`, `articles/validators.go`, `articles/doc.go`, `articles/serializers.go`
- **go-gin-realworld-11** "Which tables are migrated when the server starts?" expected `hello.go`, `users/models.go`; got `users/middlewares.go`, `users/models.go`, `users/serializers.go`, `users/validators.go`, `common/utils.go`
- **go-gin-realworld-13** "How are validation errors converted into the API error format?" expected `common/utils.go`; got `users/middlewares.go`, `users/models.go`, `users/routers.go`, `articles/models.go`, `articles/routers.go`
- **go-gin-realworld-15** "Where is user registration handled?" expected `users/routers.go`; got `users/middlewares.go`, `users/models.go`, `users/doc.go`, `users/serializers.go`, `users/validators.go`
