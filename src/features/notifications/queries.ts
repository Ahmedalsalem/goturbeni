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
//
// unreadMessageRideIds (from getUnreadMessages, src/features/chat/queries.ts)
// folds unread chat messages into these same two dots — previously an
// unread message only lit up the top-level profile-menu dot (hasAnyUnread in
// Header.tsx) with neither "İlanlarım" nor "Rezervasyonlarım" showing
// anything, so opening the menu gave no clue which one to click. A ride's
// unread message now lights up "İlanlarım" if the user drives that ride, or
// "Rezervasyonlarım" if they're a passenger on it — whichever page actually
// has the chat link.
export async function getUnreadNavBadges(userId: string, unreadMessageRideIds: Set<string> = new Set()): Promise<UnreadNavBadges> {
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
  let myRides = targets.has("my_rides")
  let myBookings = targets.has("my_bookings")

  const rideIds = [...unreadMessageRideIds]
  if (rideIds.length > 0 && (!myRides || !myBookings)) {
    const [{ data: drivenRides }, { data: passengerBookings }] = await Promise.all([
      myRides ? Promise.resolve({ data: [] as { id: string }[] }) : supabase.from("rides").select("id").eq("driver_id", userId).in("id", rideIds),
      myBookings
        ? Promise.resolve({ data: [] as { ride_id: string }[] })
        : supabase.from("bookings").select("ride_id").eq("passenger_id", userId).in("ride_id", rideIds),
    ])
    myRides ||= (drivenRides?.length ?? 0) > 0
    myBookings ||= (passengerBookings?.length ?? 0) > 0
  }

  return { myRides, myBookings }
}
