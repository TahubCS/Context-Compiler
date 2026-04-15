import { listUserNotifications } from "@/lib/db"
import { getAuthenticatedAppContext } from "@/lib/app-context"
import { NotificationInviteActions } from "@/components/features/notifications/notification-invite-actions"
import { Bell, MailCheck } from "lucide-react"

export default async function NotificationsPage() {
  const { user } = await getAuthenticatedAppContext()
  if (!user) return null

  const notifications = await listUserNotifications(user.id)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Workspace invites and other collaboration updates will appear here.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">Inbox</h2>
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <MailCheck className="size-6 text-muted-foreground" />
            <p className="font-medium text-foreground">No notifications yet</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Team invites and workflow alerts will show up here when they happen.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {notifications.map((notification) => {
              const invite = notification.workspaceInvite
              const isPendingInvite = invite?.status === "PENDING"

              return (
                <div
                  key={notification.id}
                  className="rounded-xl border border-border p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{notification.title}</p>
                      <p className="text-sm text-muted-foreground">{notification.body}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(notification.createdAt).toLocaleString()}
                        {notification.workspace ? ` | ${notification.workspace.name}` : ""}
                      </p>
                    </div>
                    {isPendingInvite && invite ? (
                      <NotificationInviteActions inviteId={invite.id} />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {notification.readAt ? "Read" : "Open"}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
