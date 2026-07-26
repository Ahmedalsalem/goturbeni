"use client"

import { useTranslations } from "next-intl"

import { Badge } from "@/components/ui/badge"
import { ReceiptUploadForm } from "@/features/bookings/ReceiptUploadForm"
import { submitRefundProof } from "@/features/bookings/actions"
import type { RefundStatus } from "@/types/booking"

// Shown to the driver on a booking whose payment was already taken but the
// ride got cancelled (cancel_ride_with_bookings flips refund_status to
// 'pending' — see supabase/migrations/0021_cancellation_refunds.sql). The
// driver uploads proof they sent the money back; an admin confirms or
// rejects it (admin_reject_refund_proof puts refundStatus back to 'pending'
// with rejectReason set — that combination is how a rejected-and-awaiting-
// resubmit refund is distinguished from a never-submitted one here).
export function RefundProofUpload({
  bookingId,
  rideId,
  refundStatus,
  rejectReason,
}: {
  bookingId: string
  rideId: string
  refundStatus: RefundStatus
  rejectReason: string | null
}) {
  const t = useTranslations("Bookings.refund")

  if (refundStatus === "not_applicable") {
    return null
  }

  if (refundStatus === "confirmed") {
    return <Badge variant="secondary">{t("status.confirmed")}</Badge>
  }

  return (
    <div className="flex flex-col gap-1">
      {refundStatus === "pending" && rejectReason && <p className="text-destructive text-xs">{t("proofRejected")}: {rejectReason}</p>}
      <div className="flex items-center gap-2">
        <Badge variant="outline">{t(`status.${refundStatus}`)}</Badge>
        <ReceiptUploadForm action={(formData) => submitRefundProof(bookingId, rideId, formData)} label={t("uploadProof")} />
      </div>
    </div>
  )
}
