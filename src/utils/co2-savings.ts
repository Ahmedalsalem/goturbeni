import { getProvinceDistanceKm } from "./turkish-provinces-geo"
import type { TurkishProvince } from "./turkish-provinces"

// Approximate average real-world passenger car emissions — NOT a precise
// measured figure, a defensible round mid-range estimate (new-car EU fleet
// averages run lower, ~100-120g/km, but in-use fleet averages across older
// vehicles run higher; 170 is a commonly-cited round figure for the mixed
// real-world fleet). Label any UI copy using this as an estimate, never as
// an authoritative measurement — same honesty convention this codebase
// already applies to getProvinceDistanceKm's own "kuş uçuşu" (straight-line,
// not road distance) disclaimer.
const AVG_CAR_EMISSIONS_G_PER_KM = 170

// Framing: seatCount people are sharing ONE car with the driver instead of
// each driving separately (seatCount + 1 total people, 1 car instead of
// seatCount + 1 cars). The shared trip avoids seatCount / (seatCount + 1)
// of the total emissions that separate trips would have produced. Uses the
// same straight-line province-centroid distance as the existing
// "nearby province" search fallback — an approximation, not exact.
export function estimateCo2SavingsKg(departureCity: TurkishProvince, arrivalCity: TurkishProvince, seatCount: number): number {
  if (seatCount <= 0) {
    return 0
  }
  const distanceKm = getProvinceDistanceKm(departureCity, arrivalCity)
  const totalEmissionsGramsIfSeparate = distanceKm * AVG_CAR_EMISSIONS_G_PER_KM * (seatCount + 1)
  const savingsFraction = seatCount / (seatCount + 1)
  const savingsGrams = totalEmissionsGramsIfSeparate * savingsFraction
  return Math.round(savingsGrams / 1000)
}
