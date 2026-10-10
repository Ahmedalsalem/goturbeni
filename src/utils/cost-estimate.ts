import { getProvinceDistanceKm } from "./turkish-provinces-geo"
import type { TurkishProvince } from "./turkish-provinces"

// Round mid-range fuel+wear estimate for Turkey — not a live fuel-price
// lookup (no such API exists in this codebase, and prices move too often
// for a hardcoded constant to track precisely anyway). A human should
// revisit this periodically, same review convention already applied to
// estimateCo2SavingsKg's own emission factor (co2-savings.ts).
const ESTIMATED_COST_PER_KM_TL = 3.5

// The per-person price depends only on the route, not on how many seats
// the ride has: dividing the trip cost by (seatCount + 1) made the
// suggestion drop every time a driver offered another seat (or a passenger
// listing added another person), which users read as a bug. Assumes a
// typical car of the driver plus two passengers sharing the cost.
const TYPICAL_COST_SHARERS = 3

// Rounds to the nearest 5 TL — a suggestion for a first-time poster who has
// no idea what to charge, not a precise invoice line (a number like
// "83.42 ₺" would oversell how rough this estimate is).
export function estimateCostSharePerSeat(departureCity: TurkishProvince, arrivalCity: TurkishProvince): number {
  const distanceKm = getProvinceDistanceKm(departureCity, arrivalCity)
  const totalCost = distanceKm * ESTIMATED_COST_PER_KM_TL
  const perSeat = totalCost / TYPICAL_COST_SHARERS
  return Math.round(perSeat / 5) * 5
}
