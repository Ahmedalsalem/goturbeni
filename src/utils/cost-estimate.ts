import { getProvinceDistanceKm } from "./turkish-provinces-geo"
import type { TurkishProvince } from "./turkish-provinces"

// Round mid-range fuel+wear estimate for Turkey — not a live fuel-price
// lookup (no such API exists in this codebase, and prices move too often
// for a hardcoded constant to track precisely anyway). A human should
// revisit this periodically, same review convention already applied to
// estimateCo2SavingsKg's own emission factor (co2-savings.ts).
const ESTIMATED_COST_PER_KM_TL = 3.5

// Same "+1 for the driver" split co2-savings.ts uses: seatCount is the
// ride's total available seats (RideForm's own seatCount field, same value
// passed to estimateCo2SavingsKg from rides/[id]/page.tsx) — those
// passengers share the actual trip cost with the driver, who doesn't pay
// for their own seat, so the total splits across (seatCount + 1) people.
// Rounds to the nearest 5 TL — a suggestion for a first-time poster who has
// no idea what to charge, not a precise invoice line (a number like
// "83.42 ₺" would oversell how rough this estimate is).
export function estimateCostSharePerSeat(departureCity: TurkishProvince, arrivalCity: TurkishProvince, seatCount: number): number {
  if (seatCount <= 0) {
    return 0
  }
  const distanceKm = getProvinceDistanceKm(departureCity, arrivalCity)
  const totalCost = distanceKm * ESTIMATED_COST_PER_KM_TL
  const perSeat = totalCost / (seatCount + 1)
  return Math.round(perSeat / 5) * 5
}
