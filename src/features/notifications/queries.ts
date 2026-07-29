import "server-only"

import { createClient } from "@/lib/supabase/server"
import { logError } from "@/lib/logger"

export interface UnreadNavBadges {
  myRides: boolean
  myBookings: boolean
}

// Powers the red dot on "İlanlarım"/"Rezervasyonlarım" in Header.tsx — cleared
// per nav target by markNavNotificationsRead() when the user actually visits
// that page (see MarkNotificationsRead.tsx).
export async function getUnreadNavBadges(userId: string): Promise<UnreadNavBadges> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("notification_events")
    .select("nav_target")
    .eq("recipient_id", userId)
    .is("read_at", null)

  if (error) {
    logError(error, "notifications.getUnreadNavBadges")
    return { myRides: false, myBookings: false }
  }

  const targets = new Set(data.map((row) => row.nav_target))
  return { myRides: targets.has("my_rides"), myBookings: targets.has("my_bookings") }
}
