import { TURKISH_PROVINCES, type TurkishProvince } from "@/utils/turkish-provinces"
import { TURKISH_PROVINCE_DISTRICTS } from "@/utils/turkish-districts"

export const RIDE_SORT_OPTIONS = ["date_asc", "date_desc", "cost_asc", "cost_desc"] as const
export type RideSort = (typeof RIDE_SORT_OPTIONS)[number]

const DEFAULT_SORT: RideSort = "date_asc"

export interface RideSearchFilters {
  from?: TurkishProvince
  to?: TurkishProvince
  fromDistrict?: string
  toDistrict?: string
  date?: string
  sort: RideSort
}

function isTurkishProvince(value: string): value is TurkishProvince {
  return (TURKISH_PROVINCES as readonly string[]).includes(value)
}

function isRideSort(value: string): value is RideSort {
  return (RIDE_SORT_OPTIONS as readonly string[]).includes(value)
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

// Invalid/unknown values (e.g. a tampered URL) are dropped rather than
// throwing — filters are advisory, never a source of a hard error.
export function parseRideSearchParams(searchParams: Record<string, string | string[] | undefined>): RideSearchFilters {
  const from = firstValue(searchParams.from)
  const to = firstValue(searchParams.to)
  const fromDistrict = firstValue(searchParams.fromDistrict)
  const toDistrict = firstValue(searchParams.toDistrict)
  const date = firstValue(searchParams.date)
  const sort = firstValue(searchParams.sort)

  const resolvedFrom = from && isTurkishProvince(from) ? from : undefined
  const resolvedTo = to && isTurkishProvince(to) ? to : undefined

  return {
    from: resolvedFrom,
    to: resolvedTo,
    // A district is only kept if it's a real district of the resolved city
    // for that side — otherwise a tampered/stale URL could search on a
    // district that doesn't belong to the selected city.
    fromDistrict: resolvedFrom && fromDistrict && TURKISH_PROVINCE_DISTRICTS[resolvedFrom]?.includes(fromDistrict) ? fromDistrict : undefined,
    toDistrict: resolvedTo && toDistrict && TURKISH_PROVINCE_DISTRICTS[resolvedTo]?.includes(toDistrict) ? toDistrict : undefined,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    sort: sort && isRideSort(sort) ? sort : DEFAULT_SORT,
  }
}
