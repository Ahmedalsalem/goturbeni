import { useTranslations } from "next-intl"

import { Badge, type badgeVariants } from "@/components/ui/badge"
import type { DisputeStatus } from "@/types/dispute"
import type { VariantProps } from "class-variance-authority"

const STATUS_VARIANTS: Record<DisputeStatus, VariantProps<typeof badgeVariants>["variant"]> = {
  open: "warning",
  in_review: "warning",
  resolved: "success",
  dismissed: "secondary",
}

export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  const t = useTranslations("Disputes.status")

  return <Badge variant={STATUS_VARIANTS[status]}>{t(status)}</Badge>
}
