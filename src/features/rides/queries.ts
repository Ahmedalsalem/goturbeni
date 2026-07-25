import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import type { RideSearchFilters, RideSort } from "@/features/rides/filters"
import type { Ride, RideWithDriver } from "@/types/ride"

const RIDE_WITH_DRIVER_SELECT = "*, driver:profiles(full_name, avatar_url, car_brand, car_model)"

const SORT_COLUMN: Record<RideSort, { column: "departure_time" | "cost_share"; ascending: boolean }> = {
  date_asc: { column: "departure_time", ascending: true },
  date_desc: { column: "departure_time", ascending: false },
  cost_asc: { column: "cost_share", ascending: true },
  cost_desc: { column: "cost_share", ascending: false },
}

// district: true applies the from/toDistrict filters; false drops them (city-
// level only) — used by getRides() to widen a district-level search that came
// back empty into a "nearby districts" fallback within the same city/cities.
function buildRidesQuery(supabase: Awaited<ReturnType<typeof createClient>>, filters: RideSearchFilters | undefined, district: boolean) {
  let query = supabase.from("rides").select(RIDE_WITH_DRIVER_SELECT).eq("status", "active")

  if (filters?.from) {
    query = query.eq("departure_city", filters.from)
  }
  if (filters?.to) {
    query = query.eq("arrival_city", filters.to)
  }
  if (district && filters?.fromDistrict) {
    query = query.eq("departure_district", filters.fromDistrict)
  }
  if (district && filters?.toDistrict) {
    query = query.eq("arrival_district", filters.toDistrict)
  }
  if (filters?.date) {
    query = query.gte("departure_time", `${filters.date}T00:00:00`).lte("departure_time", `${filters.date}T23:59:59.999`)
  }
  if (filters?.womenOnly) {
    // RLS already hides women_only rides from anyone who isn't the driver or
    // a self-declared female user (see 0016_gender_payment_profile.sql), so
    // this is purely a narrowing convenience for those who can see them.
    query = query.eq("women_only", true)
  }
  if (filters?.petsAllowed) {
    query = query.eq("pets_allowed", true)
  }
  if (filters?.smokingAllowed) {
    query = query.eq("smoking_allowed", true)
  }
  if (filters?.vipOnly) {
    query = query.eq("vip_solo", true)
  }

  const { column, ascending } = SORT_COLUMN[filters?.sort ?? "date_asc"]
  return query.order(column, { ascending })
}

export interface RideSearchResult {
  rides: RideWithDriver[]
  // true when the exact district-level search had no results and the list
  // below was widened to the whole city instead ("yakın ilçelerdeki
  // seçenekler") — only ever set when a district filter was actually active.
  usedNearbyDistricts: boolean
}

export async function getRides(filters?: RideSearchFilters): Promise<RideSearchResult> {
  // /rides is public — guests must be able to browse it even before Supabase
  // credentials are configured (see src/lib/supabase/is-configured.ts).
  if (!isSupabaseConfigured()) {
    return { rides: [], usedNearbyDistricts: false }
  }
  const supabase = await createClient()

  const { data } = await buildRidesQuery(supabase, filters, true)
  const rides = (data as RideWithDriver[] | null) ?? []
  if (rides.length > 0 || !(filters?.fromDistrict || filters?.toDistrict)) {
    return { rides, usedNearbyDistricts: false }
  }

  // No exact-district matches — widen to the same city/cities and surface
  // that as "nearby district" results instead of an empty page.
  const { data: nearbyData } = await buildRidesQuery(supabase, filters, false)
  return { rides: (nearbyData as RideWithDriver[] | null) ?? [], usedNearbyDistricts: true }
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
