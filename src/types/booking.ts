import type { RideWithDriver } from "@/types/ride"

export type BookingStatus = "pending" | "approved" | "rejected" | "cancelled"

export interface Booking {
  id: string
  ride_id: string
  passenger_id: string
  seat_count: number
  status: BookingStatus
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
