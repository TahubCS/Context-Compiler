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
* When creating new UI components, check if a Shadcn UI component exists first.
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

### 8. Design System & Theming (shadcn/ui Custom Preset)
* The project uses a custom shadcn/ui preset with a Dark deep-gray background, a **Cyan** primary accent, **Emerald** chart colors, and **Large** border radii.
* **NEVER hardcode hex codes or specific Tailwind color scales** (e.g., do not use `bg-cyan-600` or `text-gray-400`). 
* **STRICTLY use semantic theme variables:**
  * Backgrounds: `bg-background`, `bg-card`, `bg-muted`
  * Text: `text-foreground`, `text-muted-foreground`, `text-primary`
  * Borders: `border-border`, `border-input`
  * Buttons/Accents: `bg-primary text-primary-foreground` or `bg-secondary text-secondary-foreground`
* **Icons:** Strictly use `lucide-react` icons.
* **Tailwind v4:** This project uses Tailwind CSS v4. Be aware of v4 changes (no `tailwind.config.ts` required, CSS-variable driven configuration).
* **Dark Mode:** Assume the application is heavily dark-mode focused based on the UI preset.

### 9. Routing & Architecture Strict Guidelines
* **Pattern:** We use Next.js App Router Route Groups to separate concerns.
* **Public Routes:** Reside in `(public)`. Includes `/` (landing) and `/pricing`.
* **Protected Routes:** Reside in `(app)`. Includes `/dashboard`, `/repo/[repoId]`, and `/settings`. 
* **Layout Rule:** All protected routes MUST be wrapped in the `(app)/layout.tsx` which provides the global Sidebar and Top Navigation. Do not build standalone navigation headers inside individual pages.
* **UI Structure for `/repo/[repoId]`:** Must strictly follow a split-pane design: Left side for natural language search/chat, Right side for the "Context Cart" clipboard manager.
* **API Routes:** All custom backend logic must live inside `/api/...` to separate UI from data fetching.
