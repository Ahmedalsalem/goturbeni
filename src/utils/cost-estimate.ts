import { getProvinceDistanceKm } from "./turkish-provinces-geo"
import type { TurkishProvince } from "./turkish-provinces"

// The suggestion is anchored to the bus, not to fuel cost: a car-share has
// to beat the intercity bus to be worth choosing, and Turkish bus fares sit
// well below a fair split of current fuel prices. The target is about 80%
// of a bus ticket (product decision, 2026-10-11 — Ankara–İstanbul bus was
// ~490–650 TL, BlaBlaCar ~500 TL), expressed per road km so it scales with
// the route. Revisit when bus fares move, not when fuel prices do.
const SEAT_PRICE_TL_PER_ROAD_KM = 1

// getProvinceDistanceKm is straight-line between provincial capitals; real
// roads run about a quarter longer (Ankara–İstanbul: ~350 km straight,
// ~450 km by road).
const ROAD_DISTANCE_FACTOR = 1.25

// Per person and independent of the seat count — dividing a trip cost by
// (seatCount + 1) made the suggestion drop every time a driver offered
// another seat, which users read as a bug. Rounds to the nearest 5 TL — a suggestion for a first-time poster who has
// no idea what to charge, not a precise invoice line (a number like
// "83.42 ₺" would oversell how rough this estimate is).
export function estimateCostSharePerSeat(departureCity: TurkishProvince, arrivalCity: TurkishProvince): number {
  const roadKm = getProvinceDistanceKm(departureCity, arrivalCity) * ROAD_DISTANCE_FACTOR
  return Math.round((roadKm * SEAT_PRICE_TL_PER_ROAD_KM) / 5) * 5
}
