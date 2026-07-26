"use client"

import { reviewSettlementReceipt } from "@/features/admin/actions"
import { ReceiptReviewActions } from "@/features/admin/ReceiptReviewActions"

export function SettlementReceiptReviewActions({ bookingId }: { bookingId: string }) {
  return <ReceiptReviewActions onReview={(approved, reason) => reviewSettlementReceipt(bookingId, approved, reason)} />
}
