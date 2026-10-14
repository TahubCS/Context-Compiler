# Retrieval eval: baseline-hash

Base URL: `http://127.0.0.1:3100` · k = 5 · 2026-10-14T20:42:55.340Z

| Dataset | Layout | Questions | Hit@5 | Recall@5 | MRR | Pack recall | Pack tokens | Latency |
|---|---|---|---|---|---|---|---|---|
| rails-realworld | Ruby on Rails | 18 | 72% | 69% | 0.41 | 69% | 2541 | 45 ms |
| express-prisma-realworld | Express + Prisma (TypeScript) | 21 | 86% | 83% | 0.53 | 83% | 4066 | 50 ms |
| django-realworld | Django + DRF | 22 | 86% | 84% | 0.66 | 86% | 4451 | 35 ms |
| context-compiler | Next.js + FastAPI + Prisma | 22 | 73% | 70% | 0.56 | 68% | 5936 | 53 ms |
| go-gin-realworld | Go + Gin + GORM | 21 | 95% | 93% | 0.57 | 88% | 8374 | 44 ms |
| **overall** | | 104 | 83% | 80% | 0.55 | 79% | 5149 | 45 ms |

## By question kind

| Kind | Questions | Hit@5 | Recall@5 | MRR |
|---|---|---|---|---|
| nl | 92 | 85% | 83% | 0.55 |
| task | 5 | 20% | 10% | 0.12 |
| symbol | 7 | 100% | 100% | 0.86 |

## Misses (expected file not in the top 5)

- **rails-realworld-01** "Where are JWT tokens generated?" expected `app/models/user.rb`; got `app/controllers/application_controller.rb`, `app/views/users/_user.json.jbuilder`, `README.md`, `config/initializers/devise.rb`, `Gemfile`
- **rails-realworld-05** "How does following a user work?" expected `app/controllers/follows_controller.rb`; got `db/migrate/20160712045739_add_profile_fields_to_users.rb`, `app/controllers/users_controller.rb`, `db/migrate/20160712045707_devise_create_users.rb`, `app/views/users/show.json.jbuilder`, `app/views/profiles/show.json.jbuilder`
- **rails-realworld-06** "How are articles filtered by author or favorited user?" expected `app/models/article.rb`, `app/controllers/articles_controller.rb`; got `app/controllers/articles_controller.rb`, `db/migrate/20160712052128_create_articles.rb`, `app/views/articles/_article.json.jbuilder`, `app/views/articles/index.json.jbuilder`, `app/views/users/show.json.jbuilder`
- **rails-realworld-11** "How is login handled?" expected `app/controllers/sessions_controller.rb`; got `app/views/articles/show.json.jbuilder`, `app/views/users/show.json.jbuilder`, `app/views/profiles/show.json.jbuilder`, `db/migrate/20160712055201_create_favorites.rb`, `db/migrate/20160712061113_create_comments.rb`
- **rails-realworld-12** "Where are camelCase request params converted to snake_case?" expected `app/controllers/application_controller.rb`; got `app/controllers/articles_controller.rb`, `README.md`, `app/controllers/users_controller.rb`, `app/controllers/sessions_controller.rb`, `public/500.html`
- **rails-realworld-17** "Add a maximum title length for articles" expected `app/models/article.rb`; got `db/migrate/20160712045739_add_profile_fields_to_users.rb`, `db/migrate/20160712054810_add_missing_unique_indices.acts_as_taggable_on_engine.rb`, `db/migrate/20160712054812_add_missing_taggable_index.acts_as_taggable_on_engine.rb`, `db/migrate/20160712054811_add_taggings_counter_cache_to_tags.acts_as_taggable_on_engine.rb`, `db/migrate/20160712052128_create_articles.rb`
- **express-prisma-realworld-11** "How does following another user work?" expected `src/app/routes/profile/profile.service.ts`; got `src/app/routes/profile/profile.utils.ts`, `src/app/routes/article/author.mapper.ts`, `src/app/routes/auth/user.model.ts`, `src/app/routes/article/article.service.ts`, `src/app/routes/profile/profile.model.ts`
- **express-prisma-realworld-12** "What does the database schema for articles and tags look like?" expected `src/prisma/schema.prisma`; got `src/prisma/seed.ts`, `src/app/routes/routes.ts`, `src/app/routes/article/article.controller.ts`, `src/prisma/migrations/20211001143221_implicit_tags/migration.sql`, `src/app/routes/tag/tag.service.ts`
- **express-prisma-realworld-17** "Where is the current user's profile updated?" expected `src/app/routes/auth/auth.service.ts`; got `src/app/routes/auth/user-request.d.ts`, `src/app/routes/auth/user.model.ts`, `src/app/routes/auth/registered-user.model.ts`, `src/app/routes/profile/profile.utils.ts`, `src/app/routes/profile/profile.service.ts`
- **express-prisma-realworld-18** "Add pagination to the comments of an article" expected `src/app/routes/article/article.service.ts`, `src/app/routes/article/article.controller.ts`; got `src/app/routes/auth/user.model.ts`, `src/app/routes/article/article.model.ts`, `src/prisma/seed.ts`, `src/app/routes/article/comment.model.ts`, `src/app/routes/article/article.controller.ts`
- **django-realworld-06** "How does a user favorite an article?" expected `conduit/apps/articles/views.py`, `conduit/apps/profiles/models.py`; got `conduit/apps/profiles/migrations/0003_profile_favorites.py`, `conduit/apps/profiles/models.py`, `conduit/apps/articles/models.py`, `conduit/apps/articles/urls.py`, `conduit/apps/authentication/urls.py`
- **django-realworld-08** "When is a profile created for a new user?" expected `conduit/apps/authentication/signals.py`; got `conduit/apps/profiles/models.py`, `conduit/apps/profiles/views.py`, `conduit/apps/profiles/migrations/0001_initial.py`, `conduit/apps/profiles/serializers.py`, `conduit/apps/profiles/urls.py`
- **django-realworld-18** "Add a reading time field to articles" expected `conduit/apps/articles/models.py`, `conduit/apps/articles/serializers.py`; got `conduit/apps/articles/migrations/0003_auto_20160828_1656.py`, `conduit/apps/profiles/migrations/0003_profile_favorites.py`, `conduit/apps/profiles/migrations/0001_initial.py`, `conduit/apps/articles/migrations/0002_comment.py`, `conduit/apps/articles/migrations/0001_initial.py`
- **django-realworld-21** "How is the favorites count for an article calculated?" expected `conduit/apps/articles/serializers.py`; got `conduit/apps/profiles/migrations/0003_profile_favorites.py`, `conduit/apps/authentication/renderers.py`, `conduit/apps/authentication/views.py`, `conduit/apps/authentication/models.py`, `conduit/apps/authentication/__init__.py`
- **context-compiler-02** "Where are MCP API keys hashed?" expected `src/lib/crypto.ts`; got `src/lib/mcp-request.ts`, `src/lib/db/mcp-api-keys.ts`, `src/app/api/mcp/session/route.ts`, `src/app/api/repo/[repoId]/mcp-keys/route.ts`, `src/app/api/repo/[repoId]/mcp-keys/[keyId]/route.ts`
- **context-compiler-10** "How are GitHub tokens encrypted at rest?" expected `src/lib/crypto.ts`; got `src/lib/github-repository-refs.ts`, `src/lib/github-repo-sync.ts`, `src/lib/github-app.ts`, `src/components/features/settings/connect-github-app-button.tsx`, `prisma/migrations/0005_v1_2_1_remove_plaintext_github_token/migration.sql`
- **context-compiler-11** "How are search results re-ranked and deduplicated for agents?" expected `src/lib/repository-retrieval.ts`; got `src/components/features/repo/search-pane.tsx`, `src/app/api/mcp/search/route.ts`, `src/app/api/repo/[repoId]/search/route.ts`, `src/components/ui/textarea.tsx`, `src/components/ui/scroll-area.tsx`
- **context-compiler-16** "How is the grounded answer generated with model fallbacks?" expected `ai-backend/ai.py`; got `src/lib/db/answer-sessions.ts`, `src/components/features/repo/answer-rich-text.tsx`, `src/app/api/repo/[repoId]/answers/[answerId]/export/route.ts`, `src/app/api/repo/[repoId]/answer/route.ts`, `src/app/api/repo/[repoId]/answers/[answerId]/route.ts`
- **context-compiler-17** "Where are workspace invites accepted?" expected `src/app/api/workspaces/invites/[inviteId]/accept/route.ts`; got `src/lib/db/workspaces.ts`, `prisma/migrations/0008_v2_workspaces_notifications_admin/migration.sql`, `prisma/migrations/0011_v0_4_last_active_workspace/migration.sql`, `src/app/api/workspaces/[workspaceId]/invites/route.ts`, `src/components/features/workspaces/workspace-switcher.tsx`
- **context-compiler-19** "Add a rate limit to the MCP search endpoint" expected `src/app/api/mcp/search/route.ts`; got `src/lib/mcp-request.ts`, `ai-backend/main.py`, `src/lib/db/mcp-api-keys.ts`, `src/lib/db/code-documents.ts`, `src/mcp/server.ts`
- **context-compiler-21** "How does the app pick the active workspace for a user?" expected `src/lib/db/workspaces.ts`, `src/lib/app-context.ts`; got `src/lib/app-context.ts`, `src/app/(app)/layout.tsx`, `src/app/api/repo/[repoId]/scan/route.ts`, `src/app/api/notifications/route.ts`, `src/app/api/github/route.ts`
- **go-gin-realworld-11** "Which tables are migrated when the server starts?" expected `hello.go`, `users/models.go`; got `users/middlewares.go`, `hello.go`, `common/unit_test.go`, `AGENTS.md`, `readme.md`
- **go-gin-realworld-18** "Add a length limit on bio when users update their profile" expected `users/validators.go`; got `users/serializers.go`, `users/unit_test.go`, `articles/unit_test.go`, `articles/routers.go`, `common/unit_test.go`
