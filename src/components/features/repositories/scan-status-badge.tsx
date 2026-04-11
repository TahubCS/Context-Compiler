import { RepositoryScanStatus } from "@prisma/client"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

type ScanStatusBadgeProps = {
  status: RepositoryScanStatus
}

const STATUS_CONFIG: Record<
  RepositoryScanStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; spinning?: boolean }
> = {
  IDLE: { label: "Not scanned", variant: "secondary" },
  QUEUED: { label: "Queued", variant: "secondary", spinning: true },
  SCANNING: { label: "Scanning…", variant: "default", spinning: true },
  COMPLETED: { label: "Scanned", variant: "outline" },
  FAILED: { label: "Failed", variant: "destructive" },
}

export function ScanStatusBadge({ status }: ScanStatusBadgeProps) {
  const { label, variant, spinning } = STATUS_CONFIG[status]

  return (
    <Badge variant={variant} className="gap-1">
      {spinning && <Loader2 className="size-3 animate-spin" />}
      {label}
    </Badge>
  )
}
