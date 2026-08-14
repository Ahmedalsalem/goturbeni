export type RideStatus = "active" | "full" | "completed" | "cancelled"
export type RidePostedByRole = "driver" | "passenger"
export type RidePaymentMethod = "bank_transfer" | "cash"

export interface Ride {
  id: string
  driver_id: string | null
  posted_by_role: RidePostedByRole
  posted_by: string
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
  payment_method: RidePaymentMethod
  instant_booking: boolean
  status: RideStatus
  series_id: string | null
  created_at: string
  updated_at: string
}

export interface RideWithDriver extends Ride {
  driver: {
    full_name: string | null
    avatar_url: string | null
    car_brand: string | null
    car_model: string | null
    car_plate: string | null
    has_ac: boolean
  } | null
  poster: {
    full_name: string | null
    avatar_url: string | null
  } | null
}
