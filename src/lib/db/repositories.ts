import { Prisma } from "@prisma/client"
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
  lastScannedAt: true,
} as const

export type RepositoryListItem = Prisma.RepositoryGetPayload<{
  select: typeof REPOSITORY_LIST_SELECT
}>

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
