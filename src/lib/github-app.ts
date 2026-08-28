import { createSign, createHmac, timingSafeEqual } from "node:crypto"

type GitHubAppInstallationSummary = {
  id: number
  account: {
    login: string
    type: string
  } | null
}

type GitHubInstallationRepository = {
  id: number
  name: string
  full_name: string
  html_url: string
  default_branch: string | null
  private: boolean
  archived?: boolean
  owner?: {
    login: string
  }
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing ${name} environment variable.`)
  }
  return value
}

function getGithubApiBaseUrl() {
  return process.env.GITHUB_API_BASE_URL ?? "https://api.github.com"
}

function getGitHubAppPrivateKey() {
  return getRequiredEnv("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n")
}

function base64UrlEncode(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function createGitHubAppJwt() {
  const appId = getRequiredEnv("GITHUB_APP_ID")
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId,
    })
  )
  const signingInput = `${header}.${payload}`
  const signer = createSign("RSA-SHA256")
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign(getGitHubAppPrivateKey())
  return `${signingInput}.${base64UrlEncode(signature)}`
}

async function githubAppFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getGithubApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${createGitHubAppJwt()}`,
      "User-Agent": "Context-Compiler",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`GitHub App request failed with status ${response.status}.`)
  }

  return (await response.json()) as T
}

export function getGitHubAppInstallUrl(state: string) {
  const explicitInstallUrl = process.env.GITHUB_APP_INSTALL_URL
  if (explicitInstallUrl) {
    const installUrl = new URL(explicitInstallUrl)
    if (!['https:'].includes(installUrl.protocol) || installUrl.hostname !== "github.com") {
      throw new Error("GITHUB_APP_INSTALL_URL must be an https://github.com URL.")
    }
    installUrl.searchParams.set("state", state)
    return installUrl.toString()
  }

  const slug = process.env.GITHUB_APP_SLUG
  if (!slug) {
    throw new Error("Missing GITHUB_APP_INSTALL_URL or GITHUB_APP_SLUG environment variable.")
  }

  const installUrl = new URL(`https://github.com/apps/${slug}/installations/select_target`)
  installUrl.searchParams.set("state", state)
  return installUrl.toString()
}

export async function getGitHubAppInstallation(
  installationId: string
): Promise<GitHubAppInstallationSummary> {
  return githubAppFetch<GitHubAppInstallationSummary>(`/app/installations/${installationId}`)
}

export async function createGitHubInstallationAccessToken(installationId: string) {
  const response = await fetch(
    `${getGithubApiBaseUrl()}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${createGitHubAppJwt()}`,
        "User-Agent": "Context-Compiler",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    }
  )

  if (!response.ok) {
    throw new Error(
      `GitHub installation token request failed with status ${response.status}.`
    )
  }

  const data = (await response.json()) as { token: string }
  return data.token
}

export async function listInstallationRepositories(
  installationId: string
): Promise<GitHubInstallationRepository[]> {
  const token = await createGitHubInstallationAccessToken(installationId)
  const repositories: GitHubInstallationRepository[] = []
  let page = 1

  while (page <= 10) {
    const query = new URLSearchParams({
      per_page: "100",
      page: String(page),
    })

    const response = await fetch(
      `${getGithubApiBaseUrl()}/installation/repositories?${query.toString()}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "Context-Compiler",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        cache: "no-store",
      }
    )

    if (!response.ok) {
      throw new Error(
        `GitHub installation repositories request failed with status ${response.status}.`
      )
    }

    const data = (await response.json()) as {
      repositories: GitHubInstallationRepository[]
    }

    repositories.push(...data.repositories)

    if (data.repositories.length < 100) {
      break
    }

    page += 1
  }

  return repositories
}

export function verifyGitHubWebhookSignature(body: string, signature: string | null) {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET
  if (!secret || !signature) {
    return false
  }

  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)

  if (expectedBuffer.length !== signatureBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, signatureBuffer)
}

export type GitHubWebhookRepositoryPayload = GitHubInstallationRepository

export type GitHubWebhookPayload = {
  action?: string
  /** Present on push events: the full ref that was pushed, e.g. "refs/heads/main". */
  ref?: string
  /** Present on push events: the SHA before the push. */
  before?: string
  /** Present on push events: the new HEAD SHA. All-zeros means branch deletion. */
  after?: string
  installation?: {
    id: number
    account?: {
      login: string
      type: string
    } | null
  }
  repositories_added?: GitHubInstallationRepository[]
  repositories_removed?: GitHubInstallationRepository[]
  repository?: GitHubInstallationRepository
}
