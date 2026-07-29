import type { RideWithDriver } from "@/types/ride"

export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled"
export type BookingPaymentStatus = "awaiting_deposit" | "deposit_confirmed" | "settled"
export type ReceiptStatus = "pending" | "approved" | "rejected"
export type RefundStatus = "not_applicable" | "pending" | "proof_submitted" | "confirmed"

export interface Booking {
  id: string
  ride_id: string
  passenger_id: string
  seat_count: number
  status: BookingStatus
  payment_status: BookingPaymentStatus
  deposit_deadline_at: string
  driver_settled_at: string | null
  passenger_settled_at: string | null
  deposit_receipt_url: string | null
  deposit_receipt_status: ReceiptStatus | null
  deposit_receipt_reviewed_at: string | null
  deposit_receipt_reject_reason: string | null
  settlement_receipt_url: string | null
  settlement_receipt_status: ReceiptStatus | null
  settlement_receipt_reviewed_at: string | null
  settlement_receipt_reject_reason: string | null
  refund_status: RefundStatus
  refund_proof_url: string | null
  refund_requested_at: string | null
  refund_confirmed_at: string | null
  refund_reject_reason: string | null
  cancelled_at: string | null
  passenger_no_show: boolean
  driver_no_show: boolean
  created_at: string
  updated_at: string
}

export interface BookingWithRide extends Booking {
  ride: RideWithDriver
}

export interface BookingWithPassenger extends Booking {
  passenger: {
    full_name: string | null
    avatar_url: string | null
  } | null
}
