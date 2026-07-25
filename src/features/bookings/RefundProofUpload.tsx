"use client"

import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { ReceiptUploadForm } from "@/features/bookings/ReceiptUploadForm"
import { submitRefundProof } from "@/features/bookings/actions"
import type { RefundStatus } from "@/types/booking"

// Shown to the driver on a booking whose payment was already taken but the
// ride got cancelled (cancel_ride_with_bookings flips refund_status to
// 'pending' — see supabase/migrations/0021_cancellation_refunds.sql). The
// driver uploads proof they sent the money back; an admin confirms it.
export function RefundProofUpload({ bookingId, rideId, refundStatus }: { bookingId: string; rideId: string; refundStatus: RefundStatus }) {
  const t = useTranslations("Bookings.refund")

  if (refundStatus === "not_applicable") {
    return null
  }

  if (refundStatus === "confirmed") {
    return <Badge variant="secondary">{t("status.confirmed")}</Badge>
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline">{t(`status.${refundStatus}`)}</Badge>
      <ReceiptUploadForm action={(formData) => submitRefundProof(bookingId, rideId, formData)} label={t("uploadProof")} />
    </div>
  )
}
