import type { RideWithDriver } from "@/types/ride"

export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled"
export type BookingPaymentStatus = "awaiting_deposit" | "deposit_confirmed" | "settled"

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
