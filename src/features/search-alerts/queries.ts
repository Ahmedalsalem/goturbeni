import "server-only"

import { createClient } from "@/lib/supabase/server"

// Only whether the signed-in user already has this exact route saved (used
// by SearchAlertToggle.tsx to render as on/off) — exact match only, no
// nearby-province fuzziness (see 0043_ride_search_alerts.sql for why).
export async function hasSearchAlert(userId: string, departureCity: string, arrivalCity: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("ride_search_alerts")
    .select("id")
    .eq("user_id", userId)
    .eq("departure_city", departureCity)
    .eq("arrival_city", arrivalCity)
    .maybeSingle()

  return data !== null
}
