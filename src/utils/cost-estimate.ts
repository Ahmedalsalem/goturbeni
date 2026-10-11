import { getProvinceDistanceKm } from "./turkish-provinces-geo"
import type { TurkishProvince } from "./turkish-provinces"

// Fuel cost per km = pump price × typical consumption. Not a live lookup —
// update FUEL_PRICE_TL_PER_LITRE when pump prices move (last set
// 2026-10-11: benzin ~84 TL/L in İstanbul/Ankara, motorin ~97 TL/L; a
// diesel car's lower consumption lands at roughly the same cost per km).
const FUEL_PRICE_TL_PER_LITRE = 84
const FUEL_LITRES_PER_100_KM = 7
const ESTIMATED_COST_PER_KM_TL = (FUEL_PRICE_TL_PER_LITRE * FUEL_LITRES_PER_100_KM) / 100

// getProvinceDistanceKm is straight-line between provincial capitals; real
// roads run about a quarter longer (Ankara–İstanbul: ~350 km straight,
// ~450 km by road), so the fuel estimate scales it up.
const ROAD_DISTANCE_FACTOR = 1.25

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
  const totalCost = distanceKm * ROAD_DISTANCE_FACTOR * ESTIMATED_COST_PER_KM_TL
  const perSeat = totalCost / TYPICAL_COST_SHARERS
  return Math.round(perSeat / 5) * 5
}
