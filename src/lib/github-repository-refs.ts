function parseGitHubRepositoryUrl(githubUrl: string): { owner: string; repo: string } | null {
  try {
    const url = new URL(githubUrl)
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/")
    if (parts.length < 2) return null

    return {
      owner: parts[0],
      repo: parts[1].replace(/\.git$/, ""),
    }
  } catch {
    return null
  }
}

function getGitHubApiBaseUrl() {
  return process.env.GITHUB_API_BASE_URL ?? "https://api.github.com"
}

export async function getGitHubDefaultBranchHeadSha(input: {
  githubUrl: string
  defaultBranch: string
  token: string
}): Promise<string | null> {
  const parsed = parseGitHubRepositoryUrl(input.githubUrl)
  if (!parsed) return null

  const response = await fetch(
    `${getGitHubApiBaseUrl()}/repos/${parsed.owner}/${parsed.repo}/branches/${encodeURIComponent(input.defaultBranch)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${input.token}`,
        "User-Agent": "Context-Compiler",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    }
  )

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as {
    commit?: {
      sha?: string
    }
  }

  return data.commit?.sha?.trim() || null
}
