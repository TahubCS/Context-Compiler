import { describe, expect, test } from "bun:test"
import { classifyFile, kindAdjustment } from "./file-roles"

describe("classifyFile", () => {
  test.each([
    // tests across ecosystems
    ["users/unit_test.go", "test"],
    ["src/tests/services/auth.service.test.ts", "test"],
    ["spec/models/user_spec.rb", "test"],
    ["app/tests/test_views.py", "test"],
    ["src/lib/db/scan-jobs.test.ts", "test"],
    // migrations
    ["db/migrate/20160712052128_create_articles.rb", "migration"],
    ["conduit/apps/articles/migrations/0001_initial.py", "migration"],
    ["prisma/migrations/0001_init/migration.sql", "migration"],
    ["src/prisma/migrations/20210924225358_initial/migration.sql", "migration"],
    // docs, config, generated, types, templates
    ["README.md", "docs"],
    ["AGENTS.md", "docs"],
    ["docs/MCP_REFERENCE.md", "docs"],
    ["package.json", "config"],
    ["config/initializers/devise.rb", "config"],
    [".github/workflows/ci.yml", "config"],
    ["next.config.ts", "config"],
    ["bun.lock", "generated"],
    ["dist/index.js", "generated"],
    ["src/app/routes/auth/user-request.d.ts", "types"],
    ["app/views/articles/_article.json.jbuilder", "template"],
    // source
    ["config/routes.rb", "source"],
    ["src/lib/crypto.ts", "source"],
    ["conduit/settings.py", "source"],
  ])("%s is %s", (path, kind) => {
    expect(classifyFile(path).kind).toBe(kind)
  })

  test.each([
    ["app/controllers/articles_controller.rb", "entrypoint"],
    ["conduit/apps/articles/views.py", "entrypoint"],
    ["conduit/apps/articles/urls.py", "entrypoint"],
    ["articles/routers.go", "entrypoint"],
    ["src/app/routes/article/article.controller.ts", "entrypoint"],
    ["src/app/api/mcp/search/route.ts", "entrypoint"],
    ["hello.go", "entrypoint"],
    ["config/routes.rb", "entrypoint"],
    ["app/models/user.rb", "persistence"],
    ["conduit/apps/profiles/models.py", "persistence"],
    ["articles/models.go", "persistence"],
    ["src/prisma/schema.prisma", "persistence"],
    ["src/lib/db/workspaces.ts", "persistence"],
    ["src/lib/github-app.ts", "integration"],
    ["src/lib/stripe.ts", "integration"],
    ["src/app/routes/article/article.service.ts", "orchestration"],
    ["users/middlewares.go", "orchestration"],
    ["src/lib/scan-dispatch.ts", "orchestration"],
    ["conduit/apps/articles/serializers.py", "supporting"],
  ])("%s has role %s", (path, role) => {
    expect(classifyFile(path).role).toBe(role)
  })
})

describe("kindAdjustment", () => {
  test("demotes tests and migrations unless the query asks for them", () => {
    expect(kindAdjustment("test", "Where are passwords hashed?")).toBeLessThan(0)
    expect(kindAdjustment("test", "Where are the auth tests?")).toBeGreaterThan(0)
    expect(kindAdjustment("migration", "Add a reading time field to articles")).toBeLessThan(0)
    expect(kindAdjustment("migration", "Which migration adds favorites?")).toBeGreaterThan(0)
    expect(kindAdjustment("source", "anything")).toBe(0)
  })

  test("keeps config files when the query is about configuration", () => {
    expect(kindAdjustment("config", "Where is Devise configured?")).toBeGreaterThan(0)
  })
})
