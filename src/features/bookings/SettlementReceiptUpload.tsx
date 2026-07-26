"use client"

import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { ReceiptUploadForm } from "@/features/bookings/ReceiptUploadForm"
import { submitSettlementReceipt } from "@/features/bookings/actions"
import type { ReceiptStatus } from "@/types/booking"

// Shown on a completed booking until the post-trip remaining-half receipt is
// approved — needs to be a client component (not inlined in bookings/page.tsx,
// a Server Component) because the ReceiptUploadForm's `action` prop is a
// closure over bookingId/rideId, not a plain server action reference; passing
// a closure like that across the server/client boundary directly throws
// "Functions cannot be passed directly to Client Components".
export function SettlementReceiptUpload({
  bookingId,
  rideId,
  status,
  rejectReason,
}: {
  bookingId: string
  rideId: string
  status: ReceiptStatus | null
  rejectReason: string | null
}) {
  const t = useTranslations("Bookings.card")

  if (status === null || status === "rejected") {
    return (
      <div className="flex flex-col gap-1">
        {status === "rejected" && (
          <div>
            <Badge variant="outline">{t("settlementReceiptStatus.rejected")}</Badge>
            {rejectReason && <p className="text-muted-foreground mt-1 text-xs">{rejectReason}</p>}
          </div>
        )}
        <ReceiptUploadForm action={(formData) => submitSettlementReceipt(bookingId, rideId, formData)} label={t("uploadSettlementReceipt")} />
      </div>
    )
  }

  return <Badge variant={status === "approved" ? "secondary" : "outline"}>{t(`settlementReceiptStatus.${status}`)}</Badge>
}
