# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
---

# Context Compiler - Project Architecture & Agent Instructions

You are an expert full-stack developer assisting in building a micro-SaaS developer tool. 

## 🛠️ The Tech Stack
* **Framework:** Next.js (Strictly App Router)
* **Language:** TypeScript
* **Styling:** Tailwind CSS + Shadcn UI
* **Database & Auth:** Supabase (PostgreSQL) + Prisma ORM
* **State Management:** Zustand
* **Icons:** Lucide React

## 📜 Core Rules & Conventions

### 1. Next.js App Router (CRITICAL)
* We strictly use the Next.js App Router (`src/app`). 
* NEVER use the `pages/` directory.
* NEVER use `getServerSideProps`, `getStaticProps`, or `getInitialProps`.
* Default to React Server Components (RSC). Only use `"use client"` at the top of a file if the component requires React hooks (`useState`, `useEffect`, `useRef`), event listeners, or browser APIs.

### 2. Database & Data Fetching
* All database schema definitions exist in `prisma/schema.prisma`. 
* Use Prisma Client for all database interactions. Do not write raw SQL unless absolutely necessary for a complex query.
* For server-side data fetching, use async Server Components and standard `fetch()` with appropriate caching strategies, or call Prisma directly in the Server Component.

### 3. Styling & UI
* Use Tailwind CSS for all styling. Do not use CSS modules or styled-components.
* **ALWAYS check the installed Shadcn components before building custom UI.** The following 21 components already exist in `src/components/ui/` — use them instead of reinventing:
  * **Layout/Structure:** `card`, `separator`, `scroll-area`, `tabs`
  * **Forms:** `button`, `input`, `textarea`, `label`, `select`, `checkbox`, `switch`
  * **Feedback:** `alert`, `badge`, `progress`, `skeleton`, `sonner` (toasts)
  * **Overlays:** `dialog`, `dropdown-menu`, `tooltip`
  * **Data:** `table`, `accordion`
* **Do NOT run `bunx shadcn add`** for any component in the list above — it is already installed.
* Keep components highly modular and separated into `src/components/ui` (reusable elements) and `src/components/features` (domain-specific elements).

### 4. Code Quality
* Write clean, self-documenting code with meaningful variable names.
* Prioritize TypeScript interfaces and types. Avoid using `any`.
* Keep files small. If a component exceeds 150 lines, refactor it into smaller sub-components.

### 5. AI Microservice Architecture
* Note: Heavy AI chunking, embedding generation, and AST parsing are handled by a separate Python FastAPI service. The Next.js app acts as the client and dashboard. Do not attempt to run heavy LangChain/LlamaIndex operations directly in the Next.js Node.js environment.

### 6. Package Manager & Tooling
* We strictly use **Bun** for all package management and script execution.
* ALWAYS use `bun add <package>`, `bun add -d <package>`, and `bun run <script>`.
* NEVER use `npm`, `yarn`, or `pnpm`.

### 7. Prisma 7 Configuration
* We are strictly using Prisma v7+.
* NEVER put `url` or `directUrl` in the `prisma/schema.prisma` file. The datasource block should only contain `provider = "postgresql"`.
* All database connection strings are managed exclusively in `prisma.config.ts` under the `datasource` object.

### 7a. Database Migrations (CRITICAL)
* **NEVER run any Prisma migration or push command.** All schema changes are applied by the user, not the agent.
* When schema changes are needed, update `prisma/schema.prisma` and then **stop**. Inform the user what changed and instruct them to run:
  ```
  bun run prisma db push
  ```
* `prisma db push` is the correct dev command for Supabase — it diffs and applies schema changes directly without needing a shadow database. Do NOT suggest `prisma migrate dev` (requires shadow DB, unsupported by Supabase).
* **Free-tier Supabase fallback:** if direct Prisma connectivity is unavailable (for example Supabase free tier IPv4 restrictions), the agent should also provide a manual SQL migration file under `prisma/migrations/` that the user can run in Supabase SQL Editor. Do not leave schema-only changes without a runnable SQL path.

### 8. Design System & Theming (shadcn/ui Custom Preset)
* The project uses a custom shadcn/ui preset with a dark deep-gray background, a **blue/cyan** primary accent, **teal** chart colors, and **large** border radii. All colors use the OKLCH color space — do not convert to hex or HSL.
* **NEVER hardcode hex codes, OKLCH values, or specific Tailwind color scales** (e.g., do not use `bg-cyan-600`, `text-gray-400`, or `oklch(0.52 0.105 223.128)`).
* **STRICTLY use semantic CSS variable tokens for all colors:**
  * **Backgrounds:** `bg-background`, `bg-card`, `bg-muted`, `bg-popover`
  * **Text:** `text-foreground`, `text-muted-foreground`, `text-primary`, `text-card-foreground`
  * **Borders:** `border-border`, `border-input`
  * **Primary actions:** `bg-primary text-primary-foreground`
  * **Secondary/subtle:** `bg-secondary text-secondary-foreground`
  * **Accent/hover states:** `bg-accent text-accent-foreground`
  * **Destructive:** `bg-destructive text-destructive` (for errors/warnings)
  * **Sidebar (use these inside the sidebar only):** `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-primary text-sidebar-primary-foreground`, `bg-sidebar-accent text-sidebar-accent-foreground`, `border-sidebar-border`
  * **Charts:** `text-chart-1` through `text-chart-5` (teal gradient scale)
  * **Focus rings:** `ring-ring`
* **Border radius — use Tailwind radius utilities that map to the custom token scale:**
  * `rounded-sm` → ~8px, `rounded-md` → ~11px, `rounded-lg` → ~14px
  * `rounded-xl` → ~22px, `rounded-2xl` → ~29px, `rounded-3xl` → ~35px, `rounded-4xl` → ~42px
  * Buttons use `rounded-4xl`, inputs use `rounded-3xl`, cards use `rounded-xl` or `rounded-2xl`
* **Shadcn component conventions:**
  * `Card` supports a `size` prop (`"default"` | `"sm"`) — use `"sm"` for compact layouts
  * `Button` supports `variant` (`default`, `outline`, `secondary`, `ghost`, `destructive`, `link`) and `size` (`xs`, `sm`, `default`, `lg`, `icon`, `icon-sm`, `icon-lg`)
  * `Tabs` supports `orientation` (`"horizontal"` | `"vertical"`) and `listVariant` (`"default"` | `"line"`)
  * `Select` supports a `size` prop (`"sm"` | `"default"`)
  * `Switch` supports a `size` prop (`"sm"` | `"default"`)
  * `Tooltip` defaults to `delayDuration={0}` and uses inverted colors (`bg-foreground text-background`)
  * `DropdownMenu` item content uses `bg-popover/70` with `backdrop-blur-2xl` glassmorphic style
  * `Dialog` uses `rounded-4xl` and includes an optional `showCloseButton` prop (default `true`)
* **Icons:** Use `lucide-react` for all icons. **Exception:** `lucide-react` does not include a GitHub icon — use `LuGithub` from `react-icons/lu` (already installed) for any GitHub-branded icon.
* **Modals & popup forms:** Always use the `Dialog` shadcn component for any overlay that contains a form, textarea, or requires user input. Never build inline expandable panels or custom overlay divs for this purpose.
* **Notifications:** Always use `sonner` (`toast.success`, `toast.error`, `toast.info`, etc.) for all user-facing notifications. The `<Toaster>` is mounted globally in `src/components/providers.tsx` with `position="top-center"` and `richColors`. Never use `alert()` or custom toast implementations.
* **Tailwind v4:** This project uses Tailwind CSS v4 — no `tailwind.config.ts`. All theme configuration is CSS-variable driven via `src/app/globals.css`.
* **Dark Mode:** The `dark` class is forced on `<html>` in the root layout. Always design for dark mode as the primary experience.

### 9. Database Utility Layer (CRITICAL)
* **All Prisma interactions MUST go through `src/lib/db/`.** Do not import `prisma` directly in pages, layouts, or API routes — import helpers from `@/lib/db` instead.
* **Never copy `isPrismaConnectivityError`** — it lives only in `src/lib/db/errors.ts`.
* **Before writing any Prisma query**, check if a helper already exists in `src/lib/db/`:
  * `getWorkspaceRepositories(workspaceId)` — fetches repositories for the active workspace
  * `upsertGitHubRepositories(userId, workspaceId, repos)` — bulk upserts repos into the active workspace in 50-item batches
  * `upsertSupabaseUser(user)` — syncs a Supabase auth user into the Prisma User table
  * `getActiveWorkspaceForUser(userId)` — returns the active workspace chosen via the workspace cookie
  * `searchCodeDocuments(repositoryId, queryVector, limit?)` — cosine similarity search; `queryVector` must be `number[]` of length 768
* **If a helper doesn't exist**, add it to the appropriate `src/lib/db/*.ts` file and export it through `src/lib/db/index.ts`. New models get their own file (e.g., `src/lib/db/code-documents.ts`).
* **Types for Prisma results** MUST use `Prisma.<Model>GetPayload<{ select: typeof SELECT_CONST }>` — never hand-write field shapes that duplicate the schema. The shared `RepositoryListItem` type is exported from `@/lib/db`.
* The raw `prisma` client is also re-exported from `@/lib/db` for use inside `src/lib/db/*.ts` files only.
* **`CodeDocument.embedding` is `Unsupported("vector(768)")`** — we use `gemini-embedding-001` with MRL dimensionality reduction to **768**. pgvector's HNSW index has a hard 2000-dimension ceiling, so 3072 is not usable. The Python service MUST output 768-dim vectors (not 3072 or 1536). **DO NOT change this value** — it will corrupt stored embeddings and break the HNSW index. Prisma cannot use `Unsupported` fields in `where`, `select`, or `orderBy`. All vector queries MUST use `prisma.$queryRaw`. The helper lives in `src/lib/db/code-documents.ts`.

### 10. Routing & Architecture Strict Guidelines
* **Pattern:** We use Next.js App Router Route Groups to separate concerns.
* **Public Routes:** Reside in `(public)`. Includes `/` (landing) and `/pricing`.
* **Protected Routes:** Reside in `(app)`. Includes `/dashboard`, `/repo/[repoId]`, and `/settings`. 
* **Layout Rule:** All protected routes MUST be wrapped in the `(app)/layout.tsx` which provides the global Sidebar and Top Navigation. Do not build standalone navigation headers inside individual pages.
* **UI Structure for `/repo/[repoId]`:** Must strictly follow a split-pane design: Left side for natural language search/chat, Right side for the "Context Cart" clipboard manager.
* **API Routes:** All custom backend logic must live inside `/api/...` to separate UI from data fetching.

### 11. Scan Architecture & Recovery (CRITICAL)
* Repository scans are background jobs executed by the Python FastAPI service, not by the page itself.
* The source of truth for scan execution is the `ScanJob` table plus the denormalized summary fields on `Repository`.
* `Repository.activeScanJobId` must be treated as the lock for an in-flight scan. Do not queue a second scan while it is set unless recovery logic clears it first.
* The Python scanner sends `SCANNING` callbacks periodically. `ScanJob.lastHeartbeatAt` is updated on every `SCANNING` status update and is used to detect abandoned scans.
* Stale scan recovery is lazy: before queueing a new scan, and when loading `/repo/[repoId]`, the app should mark stale `SCANNING` jobs as `FAILED` if their heartbeat is too old.
* Stale code chunks must only be deleted after a scan completes successfully. Never delete old `CodeDocument` rows during a failed or abandoned scan.
* Existing repositories may have `githubRepoId = NULL` until the next GitHub sync. If code depends on immutable GitHub repo identity, instruct the user to run repo sync after applying schema SQL.

### 12. Auth & Token Storage (CRITICAL)
* GitHub OAuth tokens must never be stored or updated in plaintext route-handler code.
* The source of truth for GitHub token persistence is `src/lib/db/users.ts`.
* `updateUserGithubToken(userId, token)` must encrypt before writing to the database.
* `getUserGithubToken(userId)` must decrypt before returning to callers. Do not add a plaintext token fallback back into runtime code.
* Route handlers and pages must not write `githubToken` or `githubTokenEncrypted` directly with `prisma.user.update(...)`.
* The server requires `GITHUB_TOKEN_ENCRYPTION_KEY` for token encryption and decryption.
* The GitHub auth callback must fail loudly if the provider token is missing or cannot be encrypted/stored. Do not silently redirect authenticated users into the app when token capture failed.
* `githubTokenEncrypted` is the only supported GitHub token field. If it is missing or invalid, reconnect GitHub through the existing OAuth flow.
* For auth and security schema changes, prefer additive rollout SQL first. Column removal is allowed only once the encrypted path is already live and the manual SQL migration is provided.

### 13. Agent Handoff Rule
* If you make a major architectural, workflow, schema, background-job, auth, billing, or deployment change, you must update `AGENTS.md` in the same turn so the next agent inherits the new rules.
* Treat this as a standing command: after any major change, update `AGENTS.md` before ending the task.
* Product principle: when we commit to a major feature, prefer the durable, production-oriented version of that feature instead of a throwaway intermediate version that will need a redesign shortly after. Document the durable architecture in `AGENTS.md` when you implement it.

### 14. Saved Artifacts & Answer Workflow (CRITICAL)
* `SavedCart` and `AnswerSession` are now workspace-owned artifacts with `userId` retained for authorship.
* Saved carts and answer citations must store hybrid snapshots: keep `codeDocumentId` when available, but always persist `contentSnapshot` so exports survive rescans.
* The left repo pane now supports three workflows: semantic search, repository QA, and saved answer recall. Search remains available; answer generation is additive, not a replacement.
* Answer generation must run through the Python AI backend. Keep Next.js as orchestration/UI and do not move repo-answer synthesis into the app server.
* Prompt export is plain text / markdown only in `V1.3`. Do not add file-generation or binary export formats in this release.

### 15. Retrieval Quality & Filters (CRITICAL)
* `V1.4` upgrades repository indexing to retrieval index format version `2`. The source of truth is `Repository.indexFormatVersion`.
* Repositories with `indexFormatVersion < 2` are usable but outdated. The UI should clearly encourage a re-scan instead of pretending filters/chunking are fully up to date.
* `CodeDocument` now carries explicit filter metadata: `fileCategory`, `chunkType`, and `pathBucket`. Keep these queryable in SQL rather than hiding them only in JSON.
* Shared retrieval filters apply to both semantic search and answer generation. The first-class filter contract is: `language`, `fileCategory`, and `pathPrefix`.
* The Python scanner is responsible for overlap-based chunking and heuristic file-type-aware chunking. Do not add full AST-heavy parsing or reranking in `V1.4`.
* A fresh repository re-scan is the supported rollout path for retrieval upgrades. Do not add mixed old/new index compatibility logic unless explicitly requested later.

### 16. Workspaces, Notifications, and Admin (CRITICAL)
* `V2` moves ownership to `Workspace`. Every user must have a personal workspace, and the active workspace is selected through the `cc-active-workspace` cookie managed by `src/lib/workspace-session.ts`.
* Use `getAuthenticatedAppContext()` when a page or route needs the authenticated user plus the active workspace and platform-admin state.
* Repositories, saved carts, and answer sessions must be scoped to the active workspace in pages and API routes. Do not fall back to raw `userId` ownership checks for those models.
* Team roles are `OWNER`, `ADMIN`, and `MEMBER`. Owners control billing and admin assignment. Admins can invite/remove members and manage shared artifacts. Members can use the workspace but cannot manage billing or roles.
* Team collaboration features are enabled only when the active workspace is on a `TEAM` or `ENTERPRISE` subscription tier.
* Workspace invites are modeled as `WorkspaceInvite` plus `Notification`. Pending invites should surface in `/notifications`, and accept/decline must go through the dedicated workspace invite routes.
* Billing is now workspace-based. Stripe checkout, portal, and webhook handling must update `Workspace.subscriptionTier`, `Workspace.stripeCustomerId`, and `Workspace.stripeSubscriptionId` rather than treating the user record as the source of truth.
* Platform admin access is stored in `User.isPlatformAdmin`. The seeded platform-admin email is `Khatrim23@students.ecu.edu`, but runtime authorization should always read the DB flag, not a hardcoded email check outside user sync/bootstrap.
* The platform admin area at `/admin` is for global oversight only. Keep it server-rendered from current DB state unless explicit realtime requirements are added later.

### 17. GitHub App Sync Architecture (CRITICAL)
* `V2.1` introduces a workspace-owned GitHub App connection. The source of truth for repository inventory should move toward `Workspace.githubInstallationId`, not permanent OAuth repo polling.
* Keep Supabase GitHub OAuth for user login during transition, but prefer the GitHub App path for repository sync whenever a workspace has an installation connected.
* The GitHub App setup URL must point at `/api/github-app/callback`, and the webhook URL must point at `/api/github-app/webhook`.
* The GitHub App install flow must preserve the initiating workspace across the GitHub redirect. Use the `state` param when available, but also persist the initiating workspace in the temporary `cc-github-app-workspace` cookie so the callback can still complete the workspace binding if GitHub drops or mutates `state`.
* Existing GitHub App installs do not always bounce back through the setup URL. Keep a manual recovery path in Settings that lets an owner/admin link an already-installed GitHub App to the active workspace by installation ID or installation settings URL.
* Repository inventory sync is now webhook-first with reconciliation backup:
  * webhooks handle installation and repository lifecycle events
  * reconciliation is a safety net and manual `Sync now` fallback
  * do not treat polling-only sync as the target architecture
  * `installation_repositories` webhook payloads may be sparse. Prefer reconciling the full installation from GitHub for that event instead of assuming every added repo payload contains a full `owner.login` shape.
* `Workspace.lastRepoSyncAt` and `Workspace.lastWebhookEventAt` are the freshness signals for repo inventory. Use them instead of keeping a permanent primary “Sync GitHub Repositories” CTA in the UI once the GitHub App is connected.
* `GitHubWebhookDelivery` is the dedupe/debug log for webhook deliveries. Process GitHub deliveries idempotently by `deliveryId`.
* Webhook scope in `V2.1` is repository inventory only. Do not trigger scans from push events in this release.
* `V2.2` makes scans GitHub App-first. If `Workspace.githubInstallationId` exists, repository scans must try the workspace GitHub App installation token before any personal OAuth token. OAuth remains a fallback only for workspaces without a linked GitHub App.
* Members are allowed to start scans with the workspace GitHub App token. Do not require personal OAuth reconnects for scans when the workspace GitHub App is already linked.
