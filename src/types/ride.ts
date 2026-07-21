export type RideStatus = "active" | "full" | "completed" | "cancelled"

export interface Ride {
  id: string
  driver_id: string
  departure_city: string
  arrival_city: string
  departure_time: string
  seat_count: number
  available_seats: number
  cost_share: number
  description: string | null
  status: RideStatus
  created_at: string
  updated_at: string
}

export interface RideWithDriver extends Ride {
  driver: {
    full_name: string | null
    avatar_url: string | null
  } | null
}
