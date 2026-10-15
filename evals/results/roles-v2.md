# Retrieval eval: roles-v2

Base URL: `http://127.0.0.1:3100` · k = 5 · 2026-10-14T20:48:53.581Z

| Dataset | Layout | Questions | Hit@5 | Recall@5 | MRR | Pack recall | Pack tokens | Latency |
|---|---|---|---|---|---|---|---|---|
| rails-realworld | Ruby on Rails | 18 | 78% | 75% | 0.45 | 86% | 2031 | 53 ms |
| express-prisma-realworld | Express + Prisma (TypeScript) | 21 | 95% | 93% | 0.57 | 93% | 3703 | 55 ms |
| django-realworld | Django + DRF | 22 | 91% | 89% | 0.66 | 91% | 4398 | 44 ms |
| context-compiler | Next.js + FastAPI + Prisma | 22 | 77% | 73% | 0.67 | 73% | 5584 | 67 ms |
| go-gin-realworld | Go + Gin + GORM | 21 | 100% | 100% | 0.63 | 100% | 7895 | 54 ms |
| **overall** | | 104 | 88% | 86% | 0.60 | 88% | 4805 | 55 ms |

## By question kind

| Kind | Questions | Hit@5 | Recall@5 | MRR |
|---|---|---|---|---|
| nl | 92 | 88% | 86% | 0.59 |
| task | 5 | 80% | 60% | 0.42 |
| symbol | 7 | 100% | 100% | 0.86 |

## Misses (expected file not in the top 5)

- **rails-realworld-01** "Where are JWT tokens generated?" expected `app/models/user.rb`; got `app/controllers/application_controller.rb`, `app/views/users/_user.json.jbuilder`, `config/application.rb`, `.gitignore`, `config.ru`
- **rails-realworld-05** "How does following a user work?" expected `app/controllers/follows_controller.rb`; got `app/views/users/show.json.jbuilder`, `app/controllers/users_controller.rb`, `app/views/profiles/show.json.jbuilder`, `app/views/users/_user.json.jbuilder`, `app/models/user.rb`
- **rails-realworld-06** "How are articles filtered by author or favorited user?" expected `app/models/article.rb`, `app/controllers/articles_controller.rb`; got `app/controllers/articles_controller.rb`, `app/views/articles/_article.json.jbuilder`, `app/views/articles/index.json.jbuilder`, `app/views/users/show.json.jbuilder`, `app/views/profiles/show.json.jbuilder`
- **rails-realworld-11** "How is login handled?" expected `app/controllers/sessions_controller.rb`; got `app/views/articles/show.json.jbuilder`, `app/views/users/show.json.jbuilder`, `app/views/profiles/show.json.jbuilder`, `app/controllers/follows_controller.rb`, `app/controllers/articles_controller.rb`
- **rails-realworld-17** "Add a maximum title length for articles" expected `app/models/article.rb`; got `db/schema.rb`, `app/controllers/articles_controller.rb`, `app/assets/stylesheets/application.css`, `.gitignore`, `app/assets/javascripts/application.js`
- **express-prisma-realworld-17** "Where is the current user's profile updated?" expected `src/app/routes/auth/auth.service.ts`; got `src/app/routes/auth/user.model.ts`, `src/app/routes/auth/registered-user.model.ts`, `src/app/routes/auth/user-request.d.ts`, `src/app/routes/profile/profile.utils.ts`, `src/app/routes/profile/profile.service.ts`
- **express-prisma-realworld-18** "Add pagination to the comments of an article" expected `src/app/routes/article/article.service.ts`, `src/app/routes/article/article.controller.ts`; got `src/app/routes/auth/user.model.ts`, `src/app/routes/article/article.model.ts`, `src/app/routes/article/comment.model.ts`, `src/app/routes/article/article.controller.ts`, `src/prisma/seed.ts`
- **django-realworld-08** "When is a profile created for a new user?" expected `conduit/apps/authentication/signals.py`; got `conduit/apps/profiles/models.py`, `conduit/apps/profiles/views.py`, `conduit/apps/profiles/serializers.py`, `conduit/apps/profiles/urls.py`, `conduit/apps/profiles/renderers.py`
- **django-realworld-18** "Add a reading time field to articles" expected `conduit/apps/articles/models.py`, `conduit/apps/articles/serializers.py`; got `conduit/apps/core/models.py`, `conduit/apps/articles/models.py`, `conduit/apps/profiles/models.py`, `conduit/apps/authentication/models.py`, `conduit/apps/profiles/serializers.py`
- **django-realworld-21** "How is the favorites count for an article calculated?" expected `conduit/apps/articles/serializers.py`; got `conduit/apps/authentication/renderers.py`, `conduit/apps/authentication/views.py`, `conduit/apps/authentication/models.py`, `conduit/apps/authentication/__init__.py`, `conduit/apps/authentication/serializers.py`
- **context-compiler-01** "How are MCP API keys authenticated on requests?" expected `src/lib/mcp-request.ts`, `src/lib/db/mcp-api-keys.ts`; got `src/lib/mcp-request.ts`, `src/app/api/mcp/session/route.ts`, `src/app/api/repo/[repoId]/mcp-keys/route.ts`, `src/app/api/repo/[repoId]/mcp-keys/[keyId]/route.ts`, `src/app/api/mcp/answer/route.ts`
- **context-compiler-02** "Where are MCP API keys hashed?" expected `src/lib/crypto.ts`; got `src/app/api/mcp/session/route.ts`, `src/lib/db/mcp-api-keys.ts`, `src/lib/mcp-request.ts`, `src/app/api/repo/[repoId]/mcp-keys/route.ts`, `src/app/api/repo/[repoId]/mcp-keys/[keyId]/route.ts`
- **context-compiler-10** "How are GitHub tokens encrypted at rest?" expected `src/lib/crypto.ts`; got `src/lib/github-repository-refs.ts`, `src/lib/github-app.ts`, `src/lib/github-repo-sync.ts`, `src/app/api/github-app/install/route.ts`, `src/app/api/github-app/webhook/route.ts`
- **context-compiler-11** "How are search results re-ranked and deduplicated for agents?" expected `src/lib/repository-retrieval.ts`; got `src/components/features/repo/search-pane.tsx`, `src/app/api/mcp/search/route.ts`, `src/app/api/repo/[repoId]/search/route.ts`, `src/components/ui/textarea.tsx`, `src/components/ui/scroll-area.tsx`
- **context-compiler-16** "How is the grounded answer generated with model fallbacks?" expected `ai-backend/ai.py`; got `src/lib/db/answer-sessions.ts`, `src/components/features/repo/answer-rich-text.tsx`, `src/app/api/repo/[repoId]/answers/[answerId]/export/route.ts`, `src/app/api/repo/[repoId]/answer/route.ts`, `src/app/api/repo/[repoId]/answers/[answerId]/route.ts`
- **context-compiler-20** "Where is the incremental scan diff computed?" expected `ai-backend/scanner.py`; got `src/lib/db/scan-jobs.ts`, `src/lib/scan-dispatch.ts`, `src/components/features/repositories/scan-status-badge.tsx`, `src/components/features/repo/scan-trigger-button.tsx`, `src/components/features/repo/scan-poller.tsx`
- **context-compiler-21** "How does the app pick the active workspace for a user?" expected `src/lib/db/workspaces.ts`, `src/lib/app-context.ts`; got `src/lib/app-context.ts`, `src/app/(app)/layout.tsx`, `src/app/api/repo/[repoId]/scan/route.ts`, `src/app/api/notifications/route.ts`, `src/app/api/github/route.ts`
