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
  * `getUserRepositories(userId)` — fetches the user's repositories with the standard select shape
  * `upsertGitHubRepositories(userId, repos)` — bulk upserts repos in 50-item batches
  * `upsertSupabaseUser(user)` — syncs a Supabase auth user into the Prisma User table
  * `getUserSubscriptionTier(userId)` — returns the user's `SubscriptionTier` enum value
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
