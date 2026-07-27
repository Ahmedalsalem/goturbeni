export type RideStatus = "active" | "full" | "completed" | "cancelled"

export interface Ride {
  id: string
  driver_id: string
  departure_city: string
  arrival_city: string
  departure_district: string | null
  arrival_district: string | null
  departure_time: string
  seat_count: number
  available_seats: number
  cost_share: number
  description: string | null
  pets_allowed: boolean
  smoking_allowed: boolean
  vip_solo: boolean
  status: RideStatus
  created_at: string
  updated_at: string
}

export interface RideWithDriver extends Ride {
  driver: {
    full_name: string | null
    avatar_url: string | null
    car_brand: string | null
    car_model: string | null
  } | null
}
