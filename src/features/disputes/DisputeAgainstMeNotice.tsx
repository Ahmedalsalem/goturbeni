import { useTranslations } from "next-intl"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { Dispute } from "@/types/dispute"

// Renders only when getDisputeAgainstMeForBooking found an open/in_review
// row — see that function's comment (features/disputes/queries.ts) for why
// this exists at all. Purely informational: no in-app response flow, same
// scope as OpenDisputeButton's own read-only "alreadyOpenBadge" state.
export function DisputeAgainstMeNotice({ dispute }: { dispute: Dispute }) {
  const t = useTranslations("Disputes")

  return (
    <Alert variant="destructive">
      <AlertTitle>{t("againstMe.title")}</AlertTitle>
      <AlertDescription>{t("againstMe.description", { reason: t(`form.reason.${dispute.reason}`) })}</AlertDescription>
    </Alert>
  )
}
