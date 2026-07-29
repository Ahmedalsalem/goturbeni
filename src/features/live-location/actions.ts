"use server"

import { createClient } from "@/lib/supabase/server"
import { verifySession } from "@/lib/supabase/dal"
import { logError } from "@/lib/logger"

// Called repeatedly (throttled client-side, see ShareLocationToggle.tsx)
// while the driver has sharing turned on. RLS (0038_ride_live_locations.sql)
// re-verifies driver_id = auth.uid() and ride ownership — this is not the
// sole authorization boundary.
export async function updateRideLiveLocation(rideId: string, lat: number, lng: number): Promise<{ error?: string }> {
  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.from("ride_live_locations").upsert(
    { ride_id: rideId, driver_id: user.id, lat, lng, is_active: true, updated_at: new Date().toISOString() },
    { onConflict: "ride_id" }
  )
  if (error) {
    logError(error, "liveLocation.updateRideLiveLocation")
    return { error: "update_failed" }
  }
  return {}
}

// Flips is_active rather than deleting the row — the passenger's last-known
// "driver was here" pin/timestamp stays visible instead of disappearing.
export async function stopRideLiveLocationSharing(rideId: string): Promise<void> {
  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase
    .from("ride_live_locations")
    .update({ is_active: false })
    .eq("ride_id", rideId)
    .eq("driver_id", user.id)
  if (error) {
    logError(error, "liveLocation.stopRideLiveLocationSharing")
  }
}
