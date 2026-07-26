import "server-only"

import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
import { isSupabaseConfigured } from "@/lib/supabase/is-configured"
import type { RideSearchFilters, RideSort } from "@/features/rides/filters"
import type { Ride, RideWithDriver } from "@/types/ride"
import { getNearbyProvinces } from "@/utils/turkish-provinces-geo"

const RIDE_WITH_DRIVER_SELECT = "*, driver:profiles(full_name, avatar_url, car_brand, car_model)"

// How far (km) a province search widens once the exact departure/arrival
// province has no results — wide enough to catch a genuinely nearby
// province (e.g. Kocaeli when searching İstanbul), narrow enough that
// "nearby" doesn't quietly mean "anywhere in Turkey".
const NEARBY_PROVINCE_RADIUS_KM = 150

const SORT_COLUMN: Record<RideSort, { column: "departure_time" | "cost_share"; ascending: boolean }> = {
  date_asc: { column: "departure_time", ascending: true },
  date_desc: { column: "departure_time", ascending: false },
  cost_asc: { column: "cost_share", ascending: true },
  cost_desc: { column: "cost_share", ascending: false },
}

// Mirrors women_only in reverse: a passenger searching for a female driver.
// Driver gender (profiles_private.gender) stays private (see
// 0016_gender_payment_profile.sql) — get_female_driver_ride_ids only exposes
// which ride ids have a female driver, and only to a caller who has declared
// themselves female (raises otherwise). A non-female caller reaching this
// (only possible via a hand-crafted URL, the UI never shows the checkbox to
// them) gets the filter silently dropped, same as any other tampered filter
// value in this module — not an error page.
async function resolveFemaleDriverRideIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filters: RideSearchFilters | undefined
): Promise<string[] | null> {
  if (!filters?.femaleDriverOnly) {
    return null
  }
  const { data, error } = await supabase.rpc("get_female_driver_ride_ids")
  if (error) {
    return null
  }
  return (data as string[] | null) ?? []
}

// district: true applies the from/toDistrict filters; false drops them (city-
// level only) — used by getRides() to widen a district-level search that came
// back empty into a "nearby districts" fallback within the same city/cities.
function buildRidesQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filters: RideSearchFilters | undefined,
  district: boolean,
  femaleDriverRideIds: string[] | null
) {
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
  if (femaleDriverRideIds) {
    query = query.in("id", femaleDriverRideIds)
  }

  const { column, ascending } = SORT_COLUMN[filters?.sort ?? "date_asc"]
  return query.order(column, { ascending })
}

// Same filters as buildRidesQuery's province level (district ignored — the
// caller only reaches this once city-level search already came back empty),
// except departure/arrival city becomes "the searched province or one within
// NEARBY_PROVINCE_RADIUS_KM of it" via `.in(...)` instead of `.eq(...)`.
function buildNearbyProvinceRidesQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filters: RideSearchFilters,
  femaleDriverRideIds: string[] | null
) {
  let query = supabase.from("rides").select(RIDE_WITH_DRIVER_SELECT).eq("status", "active")

  if (filters.from) {
    query = query.in("departure_city", [filters.from, ...getNearbyProvinces(filters.from, NEARBY_PROVINCE_RADIUS_KM)])
  }
  if (filters.to) {
    query = query.in("arrival_city", [filters.to, ...getNearbyProvinces(filters.to, NEARBY_PROVINCE_RADIUS_KM)])
  }
  if (filters.date) {
    query = query.gte("departure_time", `${filters.date}T00:00:00`).lte("departure_time", `${filters.date}T23:59:59.999`)
  }
  if (filters.womenOnly) {
    query = query.eq("women_only", true)
  }
  if (filters.petsAllowed) {
    query = query.eq("pets_allowed", true)
  }
  if (filters.smokingAllowed) {
    query = query.eq("smoking_allowed", true)
  }
  if (filters.vipOnly) {
    query = query.eq("vip_solo", true)
  }
  if (femaleDriverRideIds) {
    query = query.in("id", femaleDriverRideIds)
  }

  const { column, ascending } = SORT_COLUMN[filters.sort ?? "date_asc"]
  return query.order(column, { ascending })
}

export interface RideSearchResult {
  rides: RideWithDriver[]
  // true when the exact district-level search had no results and the list
  // below was widened to the whole city instead ("yakın ilçelerdeki
  // seçenekler") — only ever set when a district filter was actually active.
  usedNearbyDistricts: boolean
  // true when even the city/province-level search had no results and the
  // list below was widened further to geographically nearby provinces
  // (haversine distance to province capitals, see turkish-provinces-geo.ts)
  // — only ever set when a from/to province filter was actually active.
  usedNearbyProvinces: boolean
}

export async function getRides(filters?: RideSearchFilters): Promise<RideSearchResult> {
  // /rides is public — guests must be able to browse it even before Supabase
  // credentials are configured (see src/lib/supabase/is-configured.ts).
  if (!isSupabaseConfigured()) {
    return { rides: [], usedNearbyDistricts: false, usedNearbyProvinces: false }
  }
  const supabase = await createClient()
  const femaleDriverRideIds = await resolveFemaleDriverRideIds(supabase, filters)

  const { data } = await buildRidesQuery(supabase, filters, true, femaleDriverRideIds)
  const rides = (data as RideWithDriver[] | null) ?? []
  if (rides.length > 0) {
    return { rides, usedNearbyDistricts: false, usedNearbyProvinces: false }
  }

  if (filters?.fromDistrict || filters?.toDistrict) {
    // No exact-district matches — widen to the same city/cities and surface
    // that as "nearby district" results instead of an empty page.
    const { data: cityData } = await buildRidesQuery(supabase, filters, false, femaleDriverRideIds)
    const cityRides = (cityData as RideWithDriver[] | null) ?? []
    if (cityRides.length > 0) {
      return { rides: cityRides, usedNearbyDistricts: true, usedNearbyProvinces: false }
    }
  }

  if (!filters?.from && !filters?.to) {
    return { rides: [], usedNearbyDistricts: false, usedNearbyProvinces: false }
  }

  // Still nothing — widen once more to provinces geographically close to the
  // searched one(s), not just the same administrative province.
  const { data: geoData } = await buildNearbyProvinceRidesQuery(supabase, filters, femaleDriverRideIds)
  return { rides: (geoData as RideWithDriver[] | null) ?? [], usedNearbyDistricts: false, usedNearbyProvinces: true }
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

// Trust signal shown to a passenger right before they send a deposit to the
// driver's IBAN (see BookingButton.tsx) — a driver's own completed-trip
// count specifically (not combined with trips taken as a passenger, unlike
// getCompletedRidesCount in reviews/queries.ts). Same departure_time-based
// "completed" check used throughout (rides.status lags pg_cron by up to a
// minute, see README → "Tamamlandı nasıl hesaplanıyor?").
export async function getDriverCompletedRideCount(driverId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from("rides")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", driverId)
    .lt("departure_time", new Date().toISOString())
  return count ?? 0
}
