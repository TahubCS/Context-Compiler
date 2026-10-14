/**
 * Path-based file classification that works across ecosystems (Next.js, Express, Django,
 * Rails, Go, Spring, ...), used to rank retrieval results and to group feature traces.
 *
 * - kind: what sort of file it is. Non-source kinds are demoted unless the query asks
 *   for them ("which migration…", "where are the tests…").
 * - role: for source files, where it sits in a request's path through the code.
 */

export type FileKind =
  | "source"
  | "test"
  | "migration"
  | "docs"
  | "config"
  | "generated"
  | "example"
  | "types"
  | "template"
  | "locale"
  | "data"

export type FileRole = "entrypoint" | "orchestration" | "persistence" | "integration" | "supporting"

export type FileClassification = { kind: FileKind; role: FileRole }

const GENERATED_RE =
  /(?:^|\/)(?:dist|build|out|coverage|generated|__generated__|vendor|node_modules|\.next|target|bin|obj)\/|\.min\.(?:js|css)$|(?:^|\/)(?:package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|go\.sum|Gemfile\.lock|poetry\.lock|Cargo\.lock)$/i
const TEST_RE =
  /(?:^|\/)(?:__tests__|__mocks__|tests?|specs?|e2e|testdata|test_helpers?)\/|\.(?:test|spec)\.[cm]?[jt]sx?$|_test\.(?:go|py|exs?)$|(?:^|\/)test_[^/]+\.py$|_spec\.rb$|(?:Test|Tests|Spec)\.(?:java|kt|cs|swift|php)$|(?:^|\/)(?:conftest\.py|test_helpers?\.go|prisma-mock\.ts)$/i
const MIGRATION_RE =
  /(?:^|\/)(?:migrations?|migrate|alembic\/versions|db\/migrate|flyway|liquibase)\/|(?:^|\/)\d{4,}[_-][^/]*\.(?:sql|rb|py|ts|js)$/i
const EXAMPLE_RE = /(?:^|\/)(?:examples?|demos?|samples?|fixtures?|mocks?|stories|storybook|playground)\//i
// Data files (fixtures, API collections, exports). JSON that configures tools is matched by
// CONFIG_RE first.
const DATA_RE = /\.(?:json|jsonl|ndjson|csv|tsv|xml|har|geojson)$/i
const DOCS_RE =
  /\.(?:md|mdx|rst|adoc|txt)$|(?:^|\/)(?:docs?|documentation)\/|(?:^|\/)(?:readme|changelog|license|contributing|agents|claude|code_of_conduct)(?:\.[^/]*)?$/i
const TYPES_RE = /\.d\.ts$|\.types\.[cm]?tsx?$|(?:^|\/)(?:types|typings|@types)\/[^/]+\.[cm]?tsx?$/i
const LOCALE_RE =
  /\.(?:po|pot|mo|xliff|xlf|arb|resx)$|(?:^|\/)(?:translations?|locales?|i18n|l10n|lang)\/[^/]*\.(?:json|ya?ml|properties|toml)$/i
const TEMPLATE_RE = /\.(?:jbuilder|erb|haml|slim|hbs|handlebars|ejs|pug|njk|jinja2?|twig|mustache|liquid)$/i
const CONFIG_RE =
  /(?:^|\/)(?:\.github|\.circleci|\.vscode|\.devcontainer)\/|(?:^|\/)(?:config|configs|initializers|settings)\/|(?:^|\/)\.(?:gitignore|gitattributes|dockerignore|npmrc|nvmrc|editorconfig|prettierignore|eslintignore|env[^/]*)$|(?:^|\/)(?:package\.json|tsconfig[^/]*\.json|jsconfig\.json|[^/]*\.config\.[cm]?[jt]s|\.eslintrc[^/]*|\.prettierrc[^/]*|Dockerfile[^/]*|docker-compose[^/]*|Makefile|Procfile|Gemfile|Rakefile|go\.mod|Cargo\.toml|pyproject\.toml|setup\.cfg|requirements[^/]*\.txt|nx\.json|project\.json|components\.json|\.env[^/]*)$|\.(?:ya?ml|toml|ini|cfg|conf|properties)$/i

// Roles. A file's own name is the stronger signal (routes/article/article.service.ts is a
// service), so name rules run before directory rules. Rails keeps its route table in
// config/, so entrypoints are checked before the config kind demotes them.
const ROLE_NAME_RULES: Array<[FileRole, RegExp]> = [
  [
    "entrypoint",
    /^(?:page|route|layout)\.[cm]?[jt]sx?$|(?:controller|handler|router|routers|routes|resolver|endpoint|endpoints|views|urls)\.[a-z]+$|_controller\.rb$|^(?:main|index|app|server|application|wsgi|asgi|manage|hello)\.(?:go|py|ts|js|rb|java|kt|rs)$/i,
  ],
  [
    "persistence",
    /(?:model|models|entity|entities|schema|repository|repo|dao|store|database|db)\.[a-z]+$|^(?:schema\.(?:prisma|rb|sql|graphql)|prisma-client\.ts)$|\.sql$/i,
  ],
  ["integration", /(?:client|adapter|gateway|webhook|provider)\.[a-z]+$/i],
  [
    "orchestration",
    /(?:service|services|usecase|interactor|middleware|middlewares|manager|worker|job|pipeline|dispatch|signals)\.[a-z]+$/i,
  ],
]
const ROLE_DIR_RULES: Array<[FileRole, RegExp]> = [
  ["entrypoint", /(?:^|\/)(?:routes?|routers?|controllers?|handlers?|endpoints?|views|api|cmd|pages|resolvers)\//i],
  ["persistence", /(?:^|\/)(?:models?|entities|entity|schemas?|repositories|repository|dao|db|database|persistence|store|stores|prisma|orm)\//i],
  ["integration", /(?:^|\/)(?:clients?|adapters?|integrations?|gateways?|providers?|webhooks?|external|sdk)\//i],
  [
    "orchestration",
    /(?:^|\/)(?:services?|usecases?|use-cases?|interactors?|domain|core|lib|middlewares?|managers?|jobs|workers?|tasks|pipelines?|commands)\//i,
  ],
]
// Third-party names in a path usually mean the file talks to that service.
const INTEGRATION_NAME_RE =
  /(?:stripe|github|gitlab|slack|twilio|sendgrid|mailer|smtp|s3|aws|gcp|azure|openai|anthropic|gemini|supabase|firebase|redis|kafka|rabbit|sqs)/i

function roleFor(path: string): FileRole {
  if (path === "config/routes.rb" || path.endsWith("/config/routes.rb")) return "entrypoint"
  const slash = path.lastIndexOf("/")
  const name = path.slice(slash + 1)
  const dir = slash >= 0 ? path.slice(0, slash + 1) : ""
  for (const [role, re] of ROLE_NAME_RULES) if (re.test(name)) return role
  if (INTEGRATION_NAME_RE.test(name)) return "integration"
  for (const [role, re] of ROLE_DIR_RULES) if (re.test(dir)) return role
  return "supporting"
}

export function classifyFile(filePath: string): FileClassification {
  const path = filePath.replace(/\\/g, "/")

  let kind: FileKind = "source"
  if (GENERATED_RE.test(path)) kind = "generated"
  else if (TEST_RE.test(path)) kind = "test"
  else if (MIGRATION_RE.test(path)) kind = "migration"
  else if (EXAMPLE_RE.test(path)) kind = "example"
  else if (LOCALE_RE.test(path)) kind = "locale"
  else if (DOCS_RE.test(path)) kind = "docs"
  else if (TYPES_RE.test(path)) kind = "types"
  else if (TEMPLATE_RE.test(path)) kind = "template"
  else if (CONFIG_RE.test(path) && roleFor(path) !== "entrypoint") kind = "config"
  else if (DATA_RE.test(path)) kind = "data"

  let role: FileRole = "supporting"
  if (kind === "source" || kind === "template") {
    role = roleFor(path)
  } else if (kind === "migration") {
    role = "persistence"
  }

  return { kind, role }
}

/** Query words that mean the user is looking for that kind of file on purpose. */
const KIND_INTENT: Partial<Record<FileKind, RegExp>> = {
  test: /\b(?:tests?|spec|specs|testing|unit|e2e|mock|mocks|fixture|fixtures)\b/i,
  migration: /\bmigrat\w*/i,
  docs: /\b(?:docs?|documentation|readme|guide|setup|install\w*|instructions?|changelog|license)\b/i,
  config: /\b(?:config\w*|settings?|env|environment|dependenc\w*|docker\w*|ci|pipeline|lint\w*|build|deploy\w*|initiali[sz]\w*)\b/i,
  example: /\b(?:examples?|demo|sample|stories|storybook|fixtures?|seed\w*)\b/i,
  types: /\b(?:types?|typings?|declarations?|interface)\b/i,
  template: /\b(?:templates?|views?|render\w*|json|html|markup)\b/i,
  locale: /\b(?:translat\w*|locali[sz]\w*|locales?|i18n|l10n|languages?)\b/i,
  data: /\b(?:json|csv|xml|data|dataset|fixtures?|collections?|exports?|samples?|payloads?)\b/i,
}

/** Score adjustment for a file's kind given the query (0 for source files). */
export function kindAdjustment(kind: FileKind, query: string): number {
  if (kind === "source") return 0
  if (kind === "generated") return -120
  const wanted = KIND_INTENT[kind]?.test(query) ?? false
  switch (kind) {
    case "test":
      return wanted ? 10 : -85
    case "migration":
      return wanted ? 15 : -70
    case "example":
      return wanted ? 0 : -85
    case "docs":
      return wanted ? 10 : -60
    case "config":
      return wanted ? 10 : -30
    case "types":
      return wanted ? 0 : -30
    case "template":
      return wanted ? 5 : -10
    case "locale":
      return wanted ? 5 : -90
    case "data":
      return wanted ? 5 : -50
  }
}
