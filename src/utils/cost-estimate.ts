import type { TurkishProvince } from "./turkish-provinces"
import routePrices from "./route-prices.json"

// Per-route table built by scripts/route-prices/build.py from real bus
// fares: the passenger's fuel share, capped at 80% of the cheapest bus
// ticket. Bus fares don't scale with distance (short or low-competition
// routes cost far more per km than trunk routes), so a single per-km rate
// misprices most routes — product decision 2026-10-16. Refresh the table
// when bus fares or fuel prices move.
const PRICES: Record<string, number> = routePrices

// Per person and independent of the seat count — dividing a trip cost by
// (seatCount + 1) made the suggestion drop every time a driver offered
// another seat, which users read as a bug. null for pairs with no direct
// bus service: there's no fare to anchor to, and a guessed number is worse
// than none for a first-time poster.
export function estimateCostSharePerSeat(departureCity: TurkishProvince, arrivalCity: TurkishProvince): number | null {
  return PRICES[`${departureCity}|${arrivalCity}`] ?? PRICES[`${arrivalCity}|${departureCity}`] ?? null
}
