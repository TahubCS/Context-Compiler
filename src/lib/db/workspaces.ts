import {
  NotificationType,
  Prisma,
  SubscriptionTier,
  WorkspaceInviteStatus,
  WorkspaceRole,
  WorkspaceType,
} from "@prisma/client"
import { prisma } from "./client"
import { getActiveWorkspaceCookie, setActiveWorkspaceCookie } from "@/lib/workspace-session"

function slugifyWorkspaceName(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40)

  return base || "workspace"
}

async function ensureUniqueWorkspaceSlug(baseName: string) {
  const baseSlug = slugifyWorkspaceName(baseName)
  let candidate = baseSlug
  let suffix = 1

  while (await prisma.workspace.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    suffix += 1
    candidate = `${baseSlug}-${suffix}`
  }

  return candidate
}

const WORKSPACE_SWITCHER_SELECT = {
  id: true,
  name: true,
  type: true,
  subscriptionTier: true,
  seatLimit: true,
  githubInstallationId: true,
  githubInstallationAccountLogin: true,
  githubAppConnectedAt: true,
  lastRepoSyncAt: true,
  _count: {
    select: {
      members: true,
    },
  },
} as const

const ACTIVE_WORKSPACE_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  subscriptionTier: true,
  seatLimit: true,
  githubInstallationId: true,
  githubInstallationAccountLogin: true,
  githubInstallationAccountType: true,
  githubAppConnectedAt: true,
  lastRepoSyncAt: true,
  lastWebhookEventAt: true,
  ownerUserId: true,
  _count: {
    select: {
      members: true,
      invites: true,
      repositories: true,
    },
  },
} as const

const WORKSPACE_MEMBER_SELECT = {
  id: true,
  role: true,
  joinedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} as const

const WORKSPACE_INVITE_SELECT = {
  id: true,
  workspaceId: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  workspace: {
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      subscriptionTier: true,
      seatLimit: true,
      ownerUserId: true,
      _count: {
        select: {
          members: true,
        },
      },
    },
  },
  invitedBy: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} as const

const WORKSPACE_BILLING_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  subscriptionTier: true,
  seatLimit: true,
  stripeCustomerId: true,
  stripeSubscriptionId: true,
  githubInstallationId: true,
  githubInstallationAccountLogin: true,
  githubAppConnectedAt: true,
  lastRepoSyncAt: true,
  ownerUserId: true,
  _count: {
    select: {
      members: true,
      invites: true,
      repositories: true,
      savedCarts: true,
      answerSessions: true,
    },
  },
} as const

const ADMIN_WORKSPACE_SELECT = {
  id: true,
  name: true,
  slug: true,
  type: true,
  subscriptionTier: true,
  seatLimit: true,
  githubInstallationId: true,
  githubInstallationAccountLogin: true,
  githubAppConnectedAt: true,
  lastRepoSyncAt: true,
  lastWebhookEventAt: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  _count: {
    select: {
      members: true,
      invites: true,
      repositories: true,
      savedCarts: true,
      answerSessions: true,
      auditLogs: true,
    },
  },
} as const

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  isPlatformAdmin: true,
  subscriptionTier: true,
  createdAt: true,
  _count: {
    select: {
      workspaceMemberships: true,
      ownedWorkspaces: true,
      repositories: true,
      savedCarts: true,
      answerSessions: true,
      notifications: true,
    },
  },
} as const

const AUDIT_LOG_SELECT = {
  id: true,
  workspaceId: true,
  actorUserId: true,
  eventType: true,
  entityType: true,
  entityId: true,
  metadata: true,
  createdAt: true,
  workspace: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  actor: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
} as const

export type WorkspaceSwitcherItem = {
  role: WorkspaceRole
  workspace: Prisma.WorkspaceGetPayload<{
    select: typeof WORKSPACE_SWITCHER_SELECT
  }>
}

export type ActiveWorkspace = Prisma.WorkspaceGetPayload<{
  select: typeof ACTIVE_WORKSPACE_SELECT
}> & {
  currentUserRole: WorkspaceRole
}

export type WorkspaceMemberListItem = Prisma.WorkspaceMemberGetPayload<{
  select: typeof WORKSPACE_MEMBER_SELECT
}>

export type WorkspaceInviteListItem = Prisma.WorkspaceInviteGetPayload<{
  select: typeof WORKSPACE_INVITE_SELECT
}>

export type WorkspaceBillingSummary = Prisma.WorkspaceGetPayload<{
  select: typeof WORKSPACE_BILLING_SELECT
}>

export type AdminWorkspaceSummary = Prisma.WorkspaceGetPayload<{
  select: typeof ADMIN_WORKSPACE_SELECT
}>

export type AdminUserSummary = Prisma.UserGetPayload<{
  select: typeof ADMIN_USER_SELECT
}>

export type AdminAuditLogItem = Prisma.AuditLogGetPayload<{
  select: typeof AUDIT_LOG_SELECT
}>

const GITHUB_WEBHOOK_DELIVERY_SELECT = {
  id: true,
  deliveryId: true,
  eventName: true,
  installationId: true,
  workspaceId: true,
  processed: true,
  errorMessage: true,
  receivedAt: true,
  processedAt: true,
} as const

export type GitHubWebhookDeliveryItem = Prisma.GitHubWebhookDeliveryGetPayload<{
  select: typeof GITHUB_WEBHOOK_DELIVERY_SELECT
}>

function canManageWorkspace(role: WorkspaceRole | null, isPlatformAdmin = false) {
  return isPlatformAdmin || role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN
}

function seatLimitForTier(tier: SubscriptionTier) {
  switch (tier) {
    case SubscriptionTier.TEAM:
      return 10
    case SubscriptionTier.ENTERPRISE:
      return 100
    default:
      return null
  }
}

export async function ensurePersonalWorkspaceForUser(userId: string, email: string, name: string | null) {
  const existingMembership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspace: {
        type: WorkspaceType.PERSONAL,
      },
    },
    select: {
      workspaceId: true,
    },
  })

  if (existingMembership) {
    return existingMembership.workspaceId
  }

  const workspaceName = name ? `${name.split(" ")[0]}'s Workspace` : email.split("@")[0]
  const slug = await ensureUniqueWorkspaceSlug(workspaceName)

  const workspace = await prisma.workspace.create({
    data: {
      name: workspaceName,
      slug,
      type: WorkspaceType.PERSONAL,
      ownerUserId: userId,
      subscriptionTier: SubscriptionTier.FREE,
      members: {
        create: {
          userId,
          role: WorkspaceRole.OWNER,
        },
      },
    },
    select: { id: true },
  })

  await prisma.repository.updateMany({
    where: { userId, workspaceId: null },
    data: { workspaceId: workspace.id },
  })
  await prisma.savedCart.updateMany({
    where: { userId, workspaceId: null },
    data: { workspaceId: workspace.id },
  })
  await prisma.answerSession.updateMany({
    where: { userId, workspaceId: null },
    data: { workspaceId: workspace.id },
  })

  return workspace.id
}

export async function listUserWorkspaces(userId: string): Promise<WorkspaceSwitcherItem[]> {
  const [memberships, user] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { userId },
      select: {
        role: true,
        workspace: {
          select: WORKSPACE_SWITCHER_SELECT,
        },
      },
      orderBy: [{ workspace: { type: "asc" } }, { workspace: { name: "asc" } }],
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformAdmin: true },
    }),
  ])

  if (!user?.isPlatformAdmin) {
    return memberships
  }

  const memberWorkspaceIds = new Set(memberships.map((membership) => membership.workspace.id))
  const allWorkspaces = await prisma.workspace.findMany({
    select: WORKSPACE_SWITCHER_SELECT,
    orderBy: [{ type: "asc" }, { name: "asc" }],
  })

  return [
    ...memberships,
    ...allWorkspaces
      .filter((workspace) => !memberWorkspaceIds.has(workspace.id))
      .map((workspace) => ({
        role: WorkspaceRole.ADMIN,
        workspace,
      })),
  ]
}

export async function getActiveWorkspaceForUser(userId: string): Promise<ActiveWorkspace | null> {
  const [memberships, user] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { userId },
      select: {
        role: true,
        workspace: {
          select: ACTIVE_WORKSPACE_SELECT,
        },
      },
      orderBy: [{ workspace: { type: "asc" } }, { workspace: { name: "asc" } }],
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformAdmin: true },
    }),
  ])

  let switchableWorkspaces = memberships

  if (user?.isPlatformAdmin) {
    const memberWorkspaceIds = new Set(memberships.map((membership) => membership.workspace.id))
    const allWorkspaces = await prisma.workspace.findMany({
      select: ACTIVE_WORKSPACE_SELECT,
      orderBy: [{ type: "asc" }, { name: "asc" }],
    })

    switchableWorkspaces = [
      ...memberships,
      ...allWorkspaces
        .filter((workspace) => !memberWorkspaceIds.has(workspace.id))
        .map((workspace) => ({
          role: WorkspaceRole.ADMIN,
          workspace,
        })),
    ]
  }

  if (switchableWorkspaces.length === 0) {
    return null
  }

  const activeWorkspaceId = await getActiveWorkspaceCookie()
  const selected =
    switchableWorkspaces.find((membership) => membership.workspace.id === activeWorkspaceId) ??
    switchableWorkspaces[0]

  return {
    ...selected.workspace,
    currentUserRole: selected.role,
  }
}

export async function setActiveWorkspaceForUser(userId: string, workspaceId: string): Promise<boolean> {
  const [membership, user, workspace] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { workspaceId: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformAdmin: true },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    }),
  ])

  if (!workspace) return false
  if (!membership && !user?.isPlatformAdmin) return false
  await setActiveWorkspaceCookie(workspaceId)
  return true
}

export async function getWorkspaceMemberRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  })

  return membership?.role ?? null
}

export async function createWorkspace(
  ownerUserId: string,
  input: {
    name: string
    type: WorkspaceType
    subscriptionTier: SubscriptionTier
    seatLimit?: number | null
  }
) {
  const slug = await ensureUniqueWorkspaceSlug(input.name)

  return prisma.workspace.create({
    data: {
      name: input.name,
      slug,
      type: input.type,
      subscriptionTier: input.subscriptionTier,
      seatLimit: input.seatLimit ?? null,
      ownerUserId,
      members: {
        create: {
          userId: ownerUserId,
          role: WorkspaceRole.OWNER,
        },
      },
      auditLogs: {
        create: {
          actorUserId: ownerUserId,
          eventType: "workspace.created",
          entityType: "workspace",
        },
      },
    },
    select: ACTIVE_WORKSPACE_SELECT,
  })
}

export async function listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberListItem[]> {
  return prisma.workspaceMember.findMany({
    where: { workspaceId },
    select: WORKSPACE_MEMBER_SELECT,
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  })
}

export async function listWorkspaceInvites(workspaceId: string): Promise<WorkspaceInviteListItem[]> {
  return prisma.workspaceInvite.findMany({
    where: { workspaceId, status: WorkspaceInviteStatus.PENDING },
    select: WORKSPACE_INVITE_SELECT,
    orderBy: [{ createdAt: "desc" }],
  })
}

export async function updateWorkspaceMemberRole(input: {
  workspaceId: string
  actorUserId: string
  memberUserId: string
  role: WorkspaceRole
  isPlatformAdmin?: boolean
}) {
  return prisma.$transaction(async (tx) => {
    const [actorMembership, targetMembership, workspace] = await Promise.all([
      tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
          },
        },
        select: { role: true },
      }),
      tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: input.workspaceId,
            userId: input.memberUserId,
          },
        },
        select: { id: true, role: true },
      }),
      tx.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { ownerUserId: true },
      }),
    ])

    if (!targetMembership) {
      throw new Error("Workspace member not found.")
    }

    if (!canManageWorkspace(actorMembership?.role ?? null, input.isPlatformAdmin)) {
      throw new Error("You do not have permission to update workspace roles.")
    }

    if (
      !input.isPlatformAdmin &&
      actorMembership?.role !== WorkspaceRole.OWNER &&
      input.role !== WorkspaceRole.MEMBER
    ) {
      throw new Error("Only workspace owners can promote or demote admins.")
    }

    if (!input.isPlatformAdmin && workspace?.ownerUserId === input.memberUserId) {
      throw new Error("The workspace owner role cannot be changed here.")
    }

    const updated = await tx.workspaceMember.update({
      where: { id: targetMembership.id },
      data: { role: input.role },
      select: WORKSPACE_MEMBER_SELECT,
    })

    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        eventType: "workspace.member.role_updated",
        entityType: "workspace_member",
        entityId: updated.id,
        metadata: {
          userId: input.memberUserId,
          role: input.role,
        },
      },
    })

    return updated
  })
}

export async function removeWorkspaceMember(input: {
  workspaceId: string
  actorUserId: string
  memberUserId: string
  isPlatformAdmin?: boolean
}) {
  return prisma.$transaction(async (tx) => {
    const [actorMembership, targetMembership, workspace] = await Promise.all([
      tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: input.workspaceId,
            userId: input.actorUserId,
          },
        },
        select: { role: true },
      }),
      tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: input.workspaceId,
            userId: input.memberUserId,
          },
        },
        select: { id: true, role: true },
      }),
      tx.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { ownerUserId: true },
      }),
    ])

    if (!targetMembership) {
      throw new Error("Workspace member not found.")
    }

    if (!canManageWorkspace(actorMembership?.role ?? null, input.isPlatformAdmin)) {
      throw new Error("You do not have permission to remove members.")
    }

    if (!input.isPlatformAdmin && workspace?.ownerUserId === input.memberUserId) {
      throw new Error("The workspace owner cannot be removed.")
    }

    if (
      !input.isPlatformAdmin &&
      actorMembership?.role !== WorkspaceRole.OWNER &&
      targetMembership.role !== WorkspaceRole.MEMBER
    ) {
      throw new Error("Only workspace owners can remove admins.")
    }

    await tx.workspaceMember.delete({
      where: { id: targetMembership.id },
    })

    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        eventType: "workspace.member.removed",
        entityType: "workspace_member",
        entityId: targetMembership.id,
        metadata: {
          userId: input.memberUserId,
          previousRole: targetMembership.role,
        },
      },
    })

    return { ok: true }
  })
}

export async function canCreatePaidWorkspace(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      isPlatformAdmin: true,
      ownedWorkspaces: {
        where: {
          subscriptionTier: {
            in: [SubscriptionTier.TEAM, SubscriptionTier.ENTERPRISE],
          },
        },
        select: { id: true },
        take: 1,
      },
    },
  })

  return !!user &&
    (user.isPlatformAdmin ||
      user.subscriptionTier === SubscriptionTier.TEAM ||
      user.subscriptionTier === SubscriptionTier.ENTERPRISE ||
      user.ownedWorkspaces.length > 0)
}

export async function workspaceHasSeatAvailable(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      seatLimit: true,
      _count: {
        select: {
          members: true,
        },
      },
    },
  })

  if (!workspace) return false
  if (!workspace.seatLimit) return true
  return workspace._count.members < workspace.seatLimit
}

export async function getWorkspaceBillingSummary(
  workspaceId: string
): Promise<WorkspaceBillingSummary | null> {
  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: WORKSPACE_BILLING_SELECT,
  })
}

export async function getWorkspaceGitHubConnection(workspaceId: string) {
  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      subscriptionTier: true,
      githubInstallationId: true,
      githubInstallationAccountLogin: true,
      githubInstallationAccountType: true,
      githubAppConnectedAt: true,
      lastRepoSyncAt: true,
      lastWebhookEventAt: true,
    },
  })
}

export async function updateWorkspaceGitHubInstallation(input: {
  workspaceId: string
  installationId: string
  accountLogin: string | null
  accountType: string | null
}) {
  return prisma.workspace.update({
    where: { id: input.workspaceId },
    data: {
      githubInstallationId: input.installationId,
      githubInstallationAccountLogin: input.accountLogin,
      githubInstallationAccountType: input.accountType,
      githubAppConnectedAt: new Date(),
      lastRepoSyncAt: null,
      lastWebhookEventAt: null,
      auditLogs: {
        create: {
          eventType: "workspace.github_app.connected",
          entityType: "workspace",
          metadata: {
            installationId: input.installationId,
            accountLogin: input.accountLogin,
            accountType: input.accountType,
          },
        },
      },
    },
    select: {
      id: true,
      githubInstallationId: true,
    },
  })
}

export async function clearWorkspaceGitHubInstallationByInstallationId(
  installationId: string
) {
  return prisma.workspace.updateMany({
    where: {
      githubInstallationId: installationId,
    },
    data: {
      githubInstallationId: null,
      githubInstallationAccountLogin: null,
      githubInstallationAccountType: null,
      lastWebhookEventAt: new Date(),
    },
  })
}

export async function markWorkspaceRepoSyncSuccess(workspaceId: string) {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      lastRepoSyncAt: new Date(),
    },
  })
}

export async function markWorkspaceWebhookReceived(
  workspaceId: string
) {
  await prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      lastWebhookEventAt: new Date(),
    },
  })
}

export async function getWorkspaceByInstallationId(installationId: string) {
  return prisma.workspace.findUnique({
    where: {
      githubInstallationId: installationId,
    },
    select: ACTIVE_WORKSPACE_SELECT,
  })
}

export async function createGitHubWebhookDelivery(input: {
  deliveryId: string
  eventName: string
  installationId?: string | null
  workspaceId?: string | null
}) {
  return prisma.gitHubWebhookDelivery.create({
    data: {
      deliveryId: input.deliveryId,
      eventName: input.eventName,
      installationId: input.installationId ?? null,
      workspaceId: input.workspaceId ?? null,
    },
    select: GITHUB_WEBHOOK_DELIVERY_SELECT,
  })
}

export async function getGitHubWebhookDelivery(deliveryId: string) {
  return prisma.gitHubWebhookDelivery.findUnique({
    where: { deliveryId },
    select: GITHUB_WEBHOOK_DELIVERY_SELECT,
  })
}

export async function markGitHubWebhookDeliveryProcessed(
  deliveryId: string,
  errorMessage?: string | null
) {
  return prisma.gitHubWebhookDelivery.update({
    where: { deliveryId },
    data: {
      processed: errorMessage ? false : true,
      errorMessage: errorMessage ?? null,
      processedAt: new Date(),
    },
    select: GITHUB_WEBHOOK_DELIVERY_SELECT,
  })
}

export async function canManageWorkspaceBilling(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const [role, user] = await Promise.all([
    getWorkspaceMemberRole(userId, workspaceId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { isPlatformAdmin: true },
    }),
  ])

  return !!user && (user.isPlatformAdmin || role === WorkspaceRole.OWNER)
}

export async function updateWorkspaceSubscription(
  workspaceId: string,
  data: {
    stripeCustomerId: string
    stripeSubscriptionId?: string | null
    subscriptionTier: SubscriptionTier
  }
) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      stripeCustomerId: data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId ?? null,
      subscriptionTier: data.subscriptionTier,
      seatLimit: seatLimitForTier(data.subscriptionTier),
      auditLogs: {
        create: {
          eventType: "workspace.subscription.updated",
          entityType: "workspace",
          metadata: {
            subscriptionTier: data.subscriptionTier,
          },
        },
      },
    },
    select: { id: true },
  })
}

export async function resetWorkspaceSubscription(workspaceId: string) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      subscriptionTier: SubscriptionTier.FREE,
      stripeSubscriptionId: null,
      seatLimit: null,
      auditLogs: {
        create: {
          eventType: "workspace.subscription.cleared",
          entityType: "workspace",
        },
      },
    },
    select: { id: true },
  })
}

export async function createWorkspaceInvite(input: {
  workspaceId: string
  invitedByUserId: string
  email: string
  role: WorkspaceRole
  isPlatformAdmin?: boolean
}) {
  const normalizedEmail = input.email.trim().toLowerCase()

  return prisma.$transaction(async (tx) => {
    const membership = await tx.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: input.workspaceId,
          userId: input.invitedByUserId,
        },
      },
      select: { role: true },
    })

    if (!canManageWorkspace(membership?.role ?? null, input.isPlatformAdmin)) {
      throw new Error("Only workspace owners or admins can invite members.")
    }

    const workspace = await tx.workspace.findUnique({
      where: { id: input.workspaceId },
      select: {
        id: true,
        name: true,
        type: true,
        subscriptionTier: true,
        seatLimit: true,
        _count: {
          select: { members: true },
        },
      },
    })

    if (!workspace) {
      throw new Error("Workspace not found.")
    }

    if (
      workspace.subscriptionTier !== SubscriptionTier.TEAM &&
      workspace.subscriptionTier !== SubscriptionTier.ENTERPRISE &&
      !input.isPlatformAdmin
    ) {
      throw new Error("Upgrade this workspace to Team or Enterprise before inviting members.")
    }

    if (workspace.seatLimit && workspace._count.members >= workspace.seatLimit) {
      throw new Error("This workspace has reached its seat limit.")
    }

    const existingUser = await tx.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    })

    if (existingUser) {
      const existingMembership = await tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: input.workspaceId,
            userId: existingUser.id,
          },
        },
        select: { id: true },
      })

      if (existingMembership) {
        throw new Error("That user is already a member of this workspace.")
      }
    }

    const existingInvite = await tx.workspaceInvite.findFirst({
      where: {
        workspaceId: input.workspaceId,
        email: normalizedEmail,
        status: WorkspaceInviteStatus.PENDING,
      },
      select: { id: true },
    })

    if (existingInvite) {
      throw new Error("There is already a pending invite for that email.")
    }

    const invite = await tx.workspaceInvite.create({
      data: {
        workspaceId: input.workspaceId,
        email: normalizedEmail,
        role: input.role,
        invitedByUserId: input.invitedByUserId,
      },
      select: WORKSPACE_INVITE_SELECT,
    })

    if (existingUser) {
      await tx.notification.create({
        data: {
          userId: existingUser.id,
          workspaceId: input.workspaceId,
          type: NotificationType.WORKSPACE_INVITE,
          title: `Workspace invite: ${workspace.name}`,
          body: `You were invited to join ${workspace.name} as ${input.role.toLowerCase()}.`,
          workspaceInviteId: invite.id,
        },
      })
    }

    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.invitedByUserId,
        eventType: "workspace.invite.created",
        entityType: "workspace_invite",
        entityId: invite.id,
        metadata: {
          email: normalizedEmail,
          role: input.role,
        },
      },
    })

    return invite
  })
}

export async function acceptWorkspaceInvite(input: {
  inviteId: string
  userId: string
  email: string
}) {
  const normalizedEmail = input.email.trim().toLowerCase()

  const result = await prisma.$transaction(async (tx) => {
    const invite = await tx.workspaceInvite.findUnique({
      where: { id: input.inviteId },
      select: WORKSPACE_INVITE_SELECT,
    })

    if (!invite || invite.status !== WorkspaceInviteStatus.PENDING) {
      throw new Error("Invite not found.")
    }

    if (invite.email.toLowerCase() !== normalizedEmail) {
      throw new Error("This invite was sent to a different email address.")
    }

    if (invite.workspace.seatLimit && invite.workspace._count.members >= invite.workspace.seatLimit) {
      throw new Error("This workspace has reached its seat limit.")
    }

    await tx.workspaceMember.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: invite.workspaceId,
          userId: input.userId,
        },
      },
      update: {
        role: invite.role,
      },
      create: {
        workspaceId: invite.workspaceId,
        userId: input.userId,
        role: invite.role,
      },
    })

    await tx.workspaceInvite.update({
      where: { id: invite.id },
      data: {
        status: WorkspaceInviteStatus.ACCEPTED,
        respondedAt: new Date(),
      },
    })

    await tx.notification.updateMany({
      where: {
        userId: input.userId,
        workspaceInviteId: invite.id,
      },
      data: {
        readAt: new Date(),
      },
    })

    await tx.auditLog.create({
      data: {
        workspaceId: invite.workspaceId,
        actorUserId: input.userId,
        eventType: "workspace.invite.accepted",
        entityType: "workspace_invite",
        entityId: invite.id,
      },
    })

    return {
      workspaceId: invite.workspaceId,
    }
  })

  await setActiveWorkspaceCookie(result.workspaceId)
  return result
}

export async function declineWorkspaceInvite(input: {
  inviteId: string
  userId: string
  email: string
}) {
  const normalizedEmail = input.email.trim().toLowerCase()

  return prisma.$transaction(async (tx) => {
    const invite = await tx.workspaceInvite.findUnique({
      where: { id: input.inviteId },
      select: WORKSPACE_INVITE_SELECT,
    })

    if (!invite || invite.status !== WorkspaceInviteStatus.PENDING) {
      throw new Error("Invite not found.")
    }

    if (invite.email.toLowerCase() !== normalizedEmail) {
      throw new Error("This invite was sent to a different email address.")
    }

    await tx.workspaceInvite.update({
      where: { id: invite.id },
      data: {
        status: WorkspaceInviteStatus.DECLINED,
        respondedAt: new Date(),
      },
    })

    await tx.notification.updateMany({
      where: {
        userId: input.userId,
        workspaceInviteId: invite.id,
      },
      data: {
        readAt: new Date(),
      },
    })

    await tx.auditLog.create({
      data: {
        workspaceId: invite.workspaceId,
        actorUserId: input.userId,
        eventType: "workspace.invite.declined",
        entityType: "workspace_invite",
        entityId: invite.id,
      },
    })

    return { workspaceId: invite.workspaceId }
  })
}

export async function listAdminUsers(limit = 100): Promise<AdminUserSummary[]> {
  return prisma.user.findMany({
    select: ADMIN_USER_SELECT,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  })
}

export async function listAdminWorkspaces(limit = 100): Promise<AdminWorkspaceSummary[]> {
  return prisma.workspace.findMany({
    select: ADMIN_WORKSPACE_SELECT,
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  })
}

export async function listAdminAuditLogs(limit = 100): Promise<AdminAuditLogItem[]> {
  return prisma.auditLog.findMany({
    select: AUDIT_LOG_SELECT,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
  })
}
