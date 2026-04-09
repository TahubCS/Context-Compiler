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