import { prisma } from "@/lib/prisma"
import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

const GITHUB_REPOS_PER_PAGE = 100
const GITHUB_MAX_PAGES = 10

type GitHubRepository = {
  name: string
  full_name: string
  html_url: string
  default_branch: string | null
  private: boolean
}

function isPrismaConnectivityError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()

  return (
    message.includes("tenant or user not found") ||
    message.includes("driveradaptererror") ||
    message.includes("can't reach database server") ||
    message.includes("connection")
  )
}

async function fetchGitHubRepositories(providerToken: string) {
  const repositories: GitHubRepository[] = []

  for (let page = 1; page <= GITHUB_MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      per_page: String(GITHUB_REPOS_PER_PAGE),
      page: String(page),
      visibility: "all",
      affiliation: "owner,collaborator,organization_member",
      sort: "updated",
    })

    const response = await fetch(`https://api.github.com/user/repos?${query.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${providerToken}`,
        "User-Agent": "Context-Compiler",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "GitHub token is missing required permissions or expired. Please sign out and sign in again."
        )
      }

      throw new Error(`GitHub repositories request failed with status ${response.status}.`)
    }

    const pageData = (await response.json()) as GitHubRepository[]
    repositories.push(...pageData)

    if (pageData.length < GITHUB_REPOS_PER_PAGE) {
      break
    }
  }

  return repositories
}

export async function POST() {
  const supabase = await createClient()

  const [{ data: userData, error: userError }, { data: sessionData, error: sessionError }] =
    await Promise.all([supabase.auth.getUser(), supabase.auth.getSession()])

  if (userError || sessionError) {
    return NextResponse.json(
      { error: "Failed to validate authenticated session." },
      { status: 500 }
    )
  }

  const user = userData.user

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const providerToken = sessionData.session?.provider_token

  if (!providerToken) {
    return NextResponse.json(
      {
        error:
          "Missing GitHub provider token in session. Please sign out and sign in again to sync repositories.",
      },
      { status: 400 }
    )
  }

  try {
    const githubRepositories = await fetchGitHubRepositories(providerToken)

    if (user.email) {
      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          email: user.email,
          githubId: user.user_metadata.provider_id?.toString() ?? null,
          name: user.user_metadata.full_name ?? user.user_metadata.user_name ?? null,
          avatarUrl: user.user_metadata.avatar_url ?? null,
        },
        create: {
          id: user.id,
          email: user.email,
          githubId: user.user_metadata.provider_id?.toString() ?? null,
          name: user.user_metadata.full_name ?? user.user_metadata.user_name ?? null,
          avatarUrl: user.user_metadata.avatar_url ?? null,
        },
      })
    }

    if (githubRepositories.length === 0) {
      return NextResponse.json({ syncedCount: 0 })
    }

    await prisma.$transaction(
      githubRepositories.map((repository) =>
        prisma.repository.upsert({
          where: {
            userId_githubUrl: {
              userId: user.id,
              githubUrl: repository.html_url,
            },
          },
          update: {
            name: repository.name,
            fullName: repository.full_name,
            defaultBranch: repository.default_branch,
            isPrivate: repository.private,
          },
          create: {
            userId: user.id,
            name: repository.name,
            fullName: repository.full_name,
            githubUrl: repository.html_url,
            defaultBranch: repository.default_branch,
            isPrivate: repository.private,
          },
        })
      )
    )

    return NextResponse.json({ syncedCount: githubRepositories.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to sync repositories."

    if (isPrismaConnectivityError(error)) {
      return NextResponse.json(
        {
          error:
            "Database is not reachable for repository sync. Verify PRISMA_DATABASE_URL or DIRECT_URL in your environment.",
        },
        { status: 503 }
      )
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}