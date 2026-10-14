import { TerminalSquare } from "lucide-react"
import { GitHubSignInButton } from "@/components/features/github-sign-in-button"
import { ConnectApproval } from "@/components/features/connect/connect-approval"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { getPendingCliAuthRequest, normalizeUserCode } from "@/lib/db"

export const dynamic = "force-dynamic"

type ConnectPageProps = { searchParams: Promise<{ code?: string }> }

export default async function ConnectPage({ searchParams }: ConnectPageProps) {
  const { code } = await searchParams
  const userCode = code ? normalizeUserCode(code) : null
  const { user, workspace } = await getAuthenticatedAppContext()

  let body: React.ReactNode
  if (!user || !workspace) {
    const nextPath = userCode ? `/connect?code=${encodeURIComponent(userCode)}` : "/connect"
    body = (
      <div className="space-y-4 text-center">
        <p className="text-sm leading-7 text-muted-foreground">
          Sign in to connect your coding agents to Context Compiler.
        </p>
        <GitHubSignInButton label="Sign in with GitHub" nextPath={nextPath} />
      </div>
    )
  } else {
    const request = userCode ? await getPendingCliAuthRequest(userCode) : null
    body = (
      <ConnectApproval
        initialCode={userCode ?? ""}
        workspaceName={workspace.name}
        request={
          request
            ? {
                userCode: request.userCode,
                clientName: request.clientName,
                keyPrefix: request.keyPrefix,
                createdAt: request.createdAt.toISOString(),
              }
            : null
        }
        codeWasInvalid={Boolean(userCode) && !request}
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-16">
      <div className="space-y-3 text-center">
        <TerminalSquare className="mx-auto size-8 text-muted-foreground" />
        <h1 className="text-2xl font-semibold text-foreground">Connect a coding agent</h1>
        <p className="text-sm leading-7 text-muted-foreground">
          Approving gives the terminal that ran <code className="rounded-sm bg-muted px-1 py-0.5">context-compiler-mcp connect</code>{" "}
          read-only access to your workspace&apos;s indexed repositories.
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-background p-6">{body}</div>
    </div>
  )
}
