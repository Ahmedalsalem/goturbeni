import "server-only"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import type { Booking, BookingWithPassenger, BookingWithRide } from "@/types/booking"

const BOOKING_WITH_RIDE_SELECT = "*, ride:rides(*, driver:profiles(full_name, avatar_url))"
const BOOKING_WITH_PASSENGER_SELECT = "*, passenger:profiles(full_name, avatar_url)"

export async function getMyBookings(passengerId: string): Promise<BookingWithRide[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select(BOOKING_WITH_RIDE_SELECT)
    .eq("passenger_id", passengerId)
    .order("created_at", { ascending: false })

  return (data as BookingWithRide[] | null) ?? []
}

export async function getRideBookings(rideId: string): Promise<BookingWithPassenger[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select(BOOKING_WITH_PASSENGER_SELECT)
    .eq("ride_id", rideId)
    .order("created_at", { ascending: true })

  return (data as BookingWithPassenger[] | null) ?? []
}

// Used by bookings/actions.ts to know who to notify after approve/reject —
// the RPCs that perform those mutations return void, so the passenger id
// isn't otherwise available in the action.
export async function getBookingPassengerId(bookingId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.from("bookings").select("passenger_id").eq("id", bookingId).single()
  return data?.passenger_id ?? null
}

// Only the passenger's currently active (pending/approved) booking, if any —
// a past rejected/cancelled booking doesn't block re-booking the same ride
// (see the partial unique index in supabase/migrations/0003_bookings.sql).
export async function getMyBookingForRide(rideId: string, passengerId: string): Promise<Booking | null> {
  if (!isSupabaseConfigured()) {
    return null
  }
  const supabase = await createClient()
  const { data } = await supabase
    .from("bookings")
    .select("*")
    .eq("ride_id", rideId)
    .eq("passenger_id", passengerId)
    .in("status", ["pending", "approved"])
    .maybeSingle()

  return data as Booking | null
}
