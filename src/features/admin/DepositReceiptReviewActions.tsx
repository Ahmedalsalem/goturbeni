"use client"

import { reviewDepositReceipt } from "@/features/admin/actions"
import { ReceiptReviewActions } from "@/features/admin/ReceiptReviewActions"

export function DepositReceiptReviewActions({ bookingId }: { bookingId: string }) {
  return <ReceiptReviewActions onReview={(approved, reason) => reviewDepositReceipt(bookingId, approved, reason)} />
}
