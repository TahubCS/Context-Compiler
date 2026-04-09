import { createClient } from "@/utils/supabase/server"
import { upsertSupabaseUser, upsertGitHubRepositories, isPrismaConnectivityError } from "@/lib/db"
import type { GitHubRepoInput } from "@/lib/db"
import { NextResponse } from "next/server"

const GITHUB_REPOS_PER_PAGE = 100
const GITHUB_MAX_PAGES = 10

async function fetchGitHubRepositories(providerToken: string) {
  const repositories: GitHubRepoInput[] = []

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

    const pageData = (await response.json()) as GitHubRepoInput[]
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

    await upsertSupabaseUser(user)
    await upsertGitHubRepositories(user.id, githubRepositories)

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
