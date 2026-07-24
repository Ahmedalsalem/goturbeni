import { TURKISH_PROVINCES, type TurkishProvince } from "@/utils/turkish-provinces"
import { TURKISH_PROVINCE_DISTRICTS } from "@/utils/turkish-districts"

// Shape confirmed by calling https://nominatim.openstreetmap.org/reverse
// directly for several Turkish coordinates: the province lives in
// `address.province` (not `state`, despite Nominatim's own docs implying
// that for most countries), and the district-equivalent lives in
// `address.town` (e.g. "Fatih", "Çankaya", "Kadıköy"). `city`/`county`/
// `city_district`/`suburb` are included as fallbacks since Nominatim's
// address shape varies by result type (road vs. shop vs. admin boundary).
export type NominatimAddress = {
  province?: string
  state?: string
  city?: string
  town?: string
  county?: string
  city_district?: string
  suburb?: string
}

export type MatchedTurkishLocation = {
  province: TurkishProvince
  district: string | null
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("tr")
}

export function matchTurkishLocation(address: NominatimAddress): MatchedTurkishLocation | null {
  const provinceCandidates = [address.province, address.state, address.city].filter((value): value is string => !!value)

  let province: TurkishProvince | undefined
  for (const candidate of provinceCandidates) {
    const normalizedCandidate = normalize(candidate)
    province = TURKISH_PROVINCES.find((p) => normalize(p) === normalizedCandidate)
    if (province) break
  }

  if (!province) return null

  const districtCandidates = [address.town, address.city_district, address.county, address.suburb].filter(
    (value): value is string => !!value
  )
  const districts = TURKISH_PROVINCE_DISTRICTS[province] ?? []

  let district: string | undefined
  for (const candidate of districtCandidates) {
    const normalizedCandidate = normalize(candidate)
    district = districts.find((d) => normalize(d) === normalizedCandidate)
    if (district) break
  }

  return { province, district: district ?? null }
}
