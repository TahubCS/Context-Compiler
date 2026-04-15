import { NotificationType, Prisma, WorkspaceInviteStatus } from "@prisma/client"
import { prisma } from "./client"

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  readAt: true,
  createdAt: true,
  workspace: {
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      subscriptionTier: true,
    },
  },
  workspaceInvite: {
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  },
} as const

export type NotificationListItem = Prisma.NotificationGetPayload<{
  select: typeof NOTIFICATION_SELECT
}>

export async function syncPendingInviteNotificationsForUser(userId: string, email: string) {
  const normalizedEmail = email.trim().toLowerCase()

  const invites = await prisma.workspaceInvite.findMany({
    where: {
      email: normalizedEmail,
      status: WorkspaceInviteStatus.PENDING,
    },
    select: {
      id: true,
      workspaceId: true,
      role: true,
      workspace: {
        select: {
          name: true,
        },
      },
    },
  })

  if (invites.length === 0) {
    return
  }

  for (const invite of invites) {
    const existingNotification = await prisma.notification.findFirst({
      where: {
        userId,
        workspaceInviteId: invite.id,
      },
      select: { id: true },
    })

    if (existingNotification) {
      continue
    }

    await prisma.notification.create({
      data: {
        userId,
        workspaceId: invite.workspaceId,
        type: NotificationType.WORKSPACE_INVITE,
        title: `Workspace invite: ${invite.workspace.name}`,
        body: `You were invited to join ${invite.workspace.name} as ${invite.role.toLowerCase()}.`,
        workspaceInviteId: invite.id,
      },
    })
  }
}

export async function listUserNotifications(userId: string): Promise<NotificationListItem[]> {
  return prisma.notification.findMany({
    where: { userId },
    select: NOTIFICATION_SELECT,
    orderBy: [{ createdAt: "desc" }],
  })
}

export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
    },
    data: {
      readAt: new Date(),
    },
  })

  return result.count > 0
}
