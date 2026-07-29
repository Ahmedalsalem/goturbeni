import "server-only"

import { createClient } from "@/lib/supabase/server"

export async function getMyWaitlistEntry(rideId: string, passengerId: string): Promise<{ seatCount: number } | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("ride_waitlist")
    .select("seat_count")
    .eq("ride_id", rideId)
    .eq("passenger_id", passengerId)
    .maybeSingle()

  return data ? { seatCount: data.seat_count } : null
}

// Shown to the driver on /rides/[id]/bookings ("N kişi bekliyor") — count
// only, no passenger identities (see the RLS policy comment in
// 0040_ride_waitlist.sql for why that restraint matters even though the
// policy itself would allow reading full rows).
export async function getRideWaitlistCount(rideId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase.from("ride_waitlist").select("id", { count: "exact", head: true }).eq("ride_id", rideId)
  return count ?? 0
}
