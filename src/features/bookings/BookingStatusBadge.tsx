import { useTranslations } from "next-intl"

import { Badge, type badgeVariants } from "@/components/ui/badge"
import type { BookingStatus } from "@/types/booking"
import type { VariantProps } from "class-variance-authority"

const STATUS_VARIANTS: Record<BookingStatus, VariantProps<typeof badgeVariants>["variant"]> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "secondary",
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const t = useTranslations("Bookings.status")

  return <Badge variant={STATUS_VARIANTS[status]}>{t(status)}</Badge>
}
