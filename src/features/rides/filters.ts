import { TURKISH_PROVINCES, type TurkishProvince } from "@/utils/turkish-provinces"

export const RIDE_SORT_OPTIONS = ["date_asc", "date_desc", "cost_asc", "cost_desc"] as const
export type RideSort = (typeof RIDE_SORT_OPTIONS)[number]

const DEFAULT_SORT: RideSort = "date_asc"

export interface RideSearchFilters {
  from?: TurkishProvince
  to?: TurkishProvince
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
  const date = firstValue(searchParams.date)
  const sort = firstValue(searchParams.sort)

  return {
    from: from && isTurkishProvince(from) ? from : undefined,
    to: to && isTurkishProvince(to) ? to : undefined,
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    sort: sort && isRideSort(sort) ? sort : DEFAULT_SORT,
  }
}
