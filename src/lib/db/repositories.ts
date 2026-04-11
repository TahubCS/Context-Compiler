import { Prisma, RepositoryScanStatus } from "@prisma/client"
import { prisma } from "./client"

const UPSERT_CHUNK_SIZE = 50

export const REPOSITORY_LIST_SELECT = {
  id: true,
  name: true,
  fullName: true,
  githubUrl: true,
  defaultBranch: true,
  isPrivate: true,
  scanStatus: true,
  scanProgress: true,
  filesDiscovered: true,
  filesProcessed: true,
  lastScannedAt: true,
} as const

const REPOSITORY_DETAIL_SELECT = {
  id: true,
  name: true,
  fullName: true,
  defaultBranch: true,
  scanStatus: true,
  scanProgress: true,
  filesDiscovered: true,
  filesProcessed: true,
} as const

export type RepositoryDetail = Prisma.RepositoryGetPayload<{
  select: typeof REPOSITORY_DETAIL_SELECT
}>

export async function getRepository(
  repoId: string,
  userId: string
): Promise<RepositoryDetail | null> {
  return prisma.repository.findFirst({
    where: { id: repoId, userId },
    select: REPOSITORY_DETAIL_SELECT,
  })
}

export async function updateRepositoryScanStatus(
  repositoryId: string,
  data: {
    scanStatus: RepositoryScanStatus
    scanProgress?: number
    filesDiscovered?: number
    filesProcessed?: number
    lastScannedAt?: Date
    errorMessage?: string | null
  }
): Promise<void> {
  await prisma.repository.update({
    where: { id: repositoryId },
    data,
  })
}

export type RepositoryListItem = Prisma.RepositoryGetPayload<{
  select: typeof REPOSITORY_LIST_SELECT
}>

export async function hasUserRepositories(userId: string): Promise<boolean> {
  const row = await prisma.repository.findFirst({
    where: { userId },
    select: { id: true },
  })
  return row !== null
}

export async function getUserRepositories(userId: string): Promise<RepositoryListItem[]> {
  return prisma.repository.findMany({
    where: { userId },
    select: REPOSITORY_LIST_SELECT,
    orderBy: [{ updatedAt: "desc" }],
    take: 100,
  })
}

export type GitHubRepoInput = {
  name: string
  full_name: string
  html_url: string
  default_branch: string | null
  private: boolean
}

/**
 * Upserts GitHub repositories in batches of 50 to avoid transaction timeouts
 * for users with large numbers of repositories (500+).
 */
export async function upsertGitHubRepositories(
  userId: string,
  repos: GitHubRepoInput[]
): Promise<void> {
  if (repos.length === 0) return

  for (let i = 0; i < repos.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = repos.slice(i, i + UPSERT_CHUNK_SIZE)

    await prisma.$transaction(
      chunk.map((repo) =>
        prisma.repository.upsert({
          where: { userId_githubUrl: { userId, githubUrl: repo.html_url } },
          update: {
            name: repo.name,
            fullName: repo.full_name,
            defaultBranch: repo.default_branch,
            isPrivate: repo.private,
          },
          create: {
            userId,
            name: repo.name,
            fullName: repo.full_name,
            githubUrl: repo.html_url,
            defaultBranch: repo.default_branch,
            isPrivate: repo.private,
          },
        })
      )
    )
  }
}
