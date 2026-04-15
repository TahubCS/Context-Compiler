# Context Compiler

Context Compiler indexes your GitHub repositories into a semantic vector store so you can search with natural language, ask questions about your code, and assemble precise context snippets — instead of guessing which files to paste into an AI assistant.

## Features

- **Natural language search** — find functions, patterns, and concepts across your entire codebase without grep or regex
- **Repository Q&A** — ask questions about your code and get AI-generated answers grounded in actual source files, with citations
- **Context Cart** — curate search results into a clipboard-ready prompt block optimized for token budgets
- **Incremental re-indexing** — only changed files are re-embedded on re-scan; unchanged chunks reuse cached vectors
- **GitHub App sync** — webhook-driven repository inventory with automatic reconciliation, no manual polling
- **Team workspaces** — share saved context carts and answer sessions across your team with owner/admin/member roles
- **Stripe billing** — free tier, Pro ($12/mo), and Team ($49/mo) plans

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui |
| Database | Supabase (PostgreSQL), Prisma ORM v7, pgvector (HNSW) |
| Auth | Supabase Auth (GitHub OAuth) + GitHub App |
| AI / Indexing | Python FastAPI microservice, Google Gemini embeddings (`gemini-embedding-001`, 768-dim) |
| Billing | Stripe Checkout + Customer Portal |
| Deployment | Vercel (Next.js) |

## Architecture

```
┌──────────────────────────────┐
│     Next.js App (Vercel)     │
│  Dashboard · Repo · Settings │
│  API routes · DB helper layer│
└──────────────┬───────────────┘
               │ HTTP
┌──────────────▼───────────────┐
│   Python FastAPI Service     │
│  git clone → chunk → embed   │
│  writes CodeDocument rows    │
└──────────────┬───────────────┘
               │
┌──────────────▼───────────────┐
│  Supabase (PostgreSQL)       │
│  pgvector HNSW index (768d)  │
└──────────────────────────────┘
```

The Next.js app handles UI, auth, workspace management, and billing. Heavy work — git cloning, overlap-based chunking, and embedding generation — runs in the Python microservice, which writes `CodeDocument` rows directly to the database. Vector similarity search runs via `prisma.$queryRaw` using cosine distance.

## Local Setup

### Prerequisites

- [Bun](https://bun.sh) >= 1.0
- [Python](https://python.org) >= 3.11 (for the AI microservice)
- A [Supabase](https://supabase.com) project with the `pgvector` extension enabled
- A GitHub OAuth App (for auth) and a GitHub App (for repo sync)

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in all required values:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Prisma / direct DB connection (not pooler)
DATABASE_URL=
DIRECT_URL=

# GitHub OAuth + App
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=        # PEM key, newlines as \n
GITHUB_APP_WEBHOOK_SECRET=
GITHUB_TOKEN_ENCRYPTION_KEY=   # 32-byte base64 key for AES-256

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Services
AI_BACKEND_URL=                # URL of the Python FastAPI service
NEXT_PUBLIC_URL=               # Public URL of this Next.js app (used for scan callbacks)
```

### 3. Push the database schema

```bash
bun run prisma db push
```

### 4. Run the development server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

> The Python AI service must also be running for repository scans to work.

## Database Notes

- `CodeDocument.embedding` is `vector(768)` with an HNSW index. Prisma cannot reference `Unsupported` fields in `where` or `select`, so all vector queries use `prisma.$queryRaw`.
- The `Workspace` model is the ownership root for repositories, saved carts, and billing. Every user gets a personal workspace on first login.
- `prisma db push` is the correct dev command for Supabase (no shadow database required). Do not use `prisma migrate dev`.

## License

MIT
