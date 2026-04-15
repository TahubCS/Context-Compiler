import { Prisma, RepositoryScanStatus } from "@prisma/client"
import { prisma } from "./client"

const UPSERT_CHUNK_SIZE = 50

export const REPOSITORY_LIST_SELECT = {
  id: true,
  githubRepoId: true,
  indexFormatVersion: true,
  name: true,
  fullName: true,
  owner: true,
  githubUrl: true,
  defaultBranch: true,
  isPrivate: true,
  scanStatus: true,
  scanProgress: true,
  filesDiscovered: true,
  filesProcessed: true,
  lastScannedAt: true,
  lastIndexedCommitSha: true,
} as const

const REPOSITORY_DETAIL_SELECT = {
  id: true,
  githubRepoId: true,
  indexFormatVersion: true,
  name: true,
  fullName: true,
  owner: true,
  githubUrl: true,
  defaultBranch: true,
  scanStatus: true,
  scanProgress: true,
  filesDiscovered: true,
  filesProcessed: true,
  errorMessage: true,
  lastIndexedCommitSha: true,
  activeScanJobId: true,
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

const REPOSITORY_SCAN_SELECT = {
  id: true,
  githubRepoId: true,
  indexFormatVersion: true,
  githubUrl: true,
  owner: true,
  name: true,
  fullName: true,
  defaultBranch: true,
  activeScanJobId: true,
} as const

export type RepositoryScanInfo = Prisma.RepositoryGetPayload<{
  select: typeof REPOSITORY_SCAN_SELECT
}>

/** Fetches only the fields needed to trigger a scan. */
export async function getRepositoryForScan(
  repoId: string,
  userId: string
): Promise<RepositoryScanInfo | null> {
  return prisma.repository.findFirst({
    where: { id: repoId, userId },
    select: REPOSITORY_SCAN_SELECT,
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
    lastIndexedCommitSha?: string | null
    activeScanJobId?: string | null
    indexFormatVersion?: number
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
  id: number
  name: string
  full_name: string
  html_url: string
  default_branch: string | null
  private: boolean
  owner: {
    login: string
  }
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

  const existingRepositories = await prisma.repository.findMany({
    where: { userId },
    select: {
      id: true,
      githubRepoId: true,
      githubUrl: true,
    },
  })

  const existingByGithubRepoId = new Map(
    existingRepositories
      .filter((repository) => repository.githubRepoId)
      .map((repository) => [repository.githubRepoId as string, repository.id])
  )
  const existingByGithubUrl = new Map(
    existingRepositories.map((repository) => [repository.githubUrl, repository.id])
  )

  for (let i = 0; i < repos.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = repos.slice(i, i + UPSERT_CHUNK_SIZE)

    await prisma.$transaction(
      chunk.map((repo) => {
        const githubRepoId = String(repo.id)
        const existingRepositoryId =
          existingByGithubRepoId.get(githubRepoId) ?? existingByGithubUrl.get(repo.html_url)

        if (existingRepositoryId) {
          return prisma.repository.update({
            where: { id: existingRepositoryId },
            data: {
              githubRepoId,
              name: repo.name,
              fullName: repo.full_name,
              owner: repo.owner.login,
              githubUrl: repo.html_url,
              defaultBranch: repo.default_branch,
              isPrivate: repo.private,
            },
          })
        }

        return prisma.repository.create({
          data: {
            userId,
            githubRepoId,
            name: repo.name,
            fullName: repo.full_name,
            owner: repo.owner.login,
            githubUrl: repo.html_url,
            defaultBranch: repo.default_branch,
            isPrivate: repo.private,
          },
        })
      })
    )
  }
}
