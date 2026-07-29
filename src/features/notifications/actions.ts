"use server"

import { createClient } from "@/lib/supabase/server"
import { verifySession } from "@/lib/supabase/dal"
import { logError } from "@/lib/logger"

export type NavTarget = "my_rides" | "my_bookings"

// Fired once from MarkNotificationsRead.tsx when the user lands on /rides/mine
// or /bookings — clears the red dot for that nav item (see Header.tsx).
export async function markNavNotificationsRead(navTarget: NavTarget): Promise<void> {
  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase
    .from("notification_events")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .eq("nav_target", navTarget)
    .is("read_at", null)

  if (error) {
    logError(error, "notifications.markNavNotificationsRead")
  }
}
