import { useTranslations } from "next-intl"

import { Badge, type badgeVariants } from "@/components/ui/badge"
import type { RideStatus } from "@/types/ride"
import type { VariantProps } from "class-variance-authority"

const STATUS_VARIANTS: Record<RideStatus, VariantProps<typeof badgeVariants>["variant"]> = {
  active: "success",
  full: "warning",
  completed: "secondary",
  cancelled: "destructive",
}

export function RideStatusBadge({ status }: { status: RideStatus }) {
  const t = useTranslations("Rides.status")

  return <Badge variant={STATUS_VARIANTS[status]}>{t(status)}</Badge>
}
