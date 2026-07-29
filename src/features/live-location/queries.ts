import "server-only"

import { createClient } from "@/lib/supabase/server"

export interface RideLiveLocation {
  lat: number
  lng: number
  isActive: boolean
  updatedAt: string
}

// RLS (0038_ride_live_locations.sql) already scopes this to the ride's driver
// or an approved-booking passenger — no relationship check needed here.
export async function getRideLiveLocation(rideId: string): Promise<RideLiveLocation | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("ride_live_locations")
    .select("lat, lng, is_active, updated_at")
    .eq("ride_id", rideId)
    .maybeSingle()

  if (!data) {
    return null
  }
  return { lat: data.lat, lng: data.lng, isActive: data.is_active, updatedAt: data.updated_at }
}
