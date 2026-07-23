import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import type { RideSearchFilters, RideSort } from "@/features/rides/filters"
import type { Ride, RideWithDriver } from "@/types/ride"

const RIDE_WITH_DRIVER_SELECT = "*, driver:profiles(full_name, avatar_url)"

const SORT_COLUMN: Record<RideSort, { column: "departure_time" | "cost_share"; ascending: boolean }> = {
  date_asc: { column: "departure_time", ascending: true },
  date_desc: { column: "departure_time", ascending: false },
  cost_asc: { column: "cost_share", ascending: true },
  cost_desc: { column: "cost_share", ascending: false },
}

export async function getRides(filters?: RideSearchFilters): Promise<RideWithDriver[]> {
  // /rides is public — guests must be able to browse it even before Supabase
  // credentials are configured (see src/lib/supabase/is-configured.ts).
  if (!isSupabaseConfigured()) {
    return []
  }
  const supabase = await createClient()
  let query = supabase.from("rides").select(RIDE_WITH_DRIVER_SELECT).eq("status", "active")

  if (filters?.from) {
    query = query.eq("departure_city", filters.from)
  }
  if (filters?.to) {
    query = query.eq("arrival_city", filters.to)
  }
  if (filters?.fromDistrict) {
    query = query.eq("departure_district", filters.fromDistrict)
  }
  if (filters?.toDistrict) {
    query = query.eq("arrival_district", filters.toDistrict)
  }
  if (filters?.date) {
    query = query.gte("departure_time", `${filters.date}T00:00:00`).lte("departure_time", `${filters.date}T23:59:59.999`)
  }

  const { column, ascending } = SORT_COLUMN[filters?.sort ?? "date_asc"]
  query = query.order(column, { ascending })

  const { data } = await query
  return (data as RideWithDriver[] | null) ?? []
}

export async function getRide(rideId: string): Promise<Ride | null> {
  const supabase = await createClient()
  const { data } = await supabase.from("rides").select("*").eq("id", rideId).single()
  return data as Ride | null
}

// Wrapped in React's cache() because rides/[id]/page.tsx calls this once in
// generateMetadata and again in the page body — cache() dedupes both into a
// single Supabase round trip per request.
export const getRideWithDriver = cache(async (rideId: string): Promise<RideWithDriver | null> => {
  const supabase = await createClient()
  const { data } = await supabase.from("rides").select(RIDE_WITH_DRIVER_SELECT).eq("id", rideId).single()
  return data as RideWithDriver | null
})

export async function getMyRides(driverId: string): Promise<RideWithDriver[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("rides")
    .select(RIDE_WITH_DRIVER_SELECT)
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })

  return (data as RideWithDriver[] | null) ?? []
}
