import type { NominatimAddress } from "@/utils/match-turkish-location"

// Nominatim's usage policy (https://operations.osmfoundation.org/policies/nominatim/)
// requires a descriptive User-Agent/Referer, which the browser supplies
// automatically via the Referer header for same-origin fetches — no extra
// header needed here. Callers are responsible for only invoking this on
// explicit user action (button click / marker-drag-end), never on a timer
// or continuous interaction, to stay within the single-click usage the
// policy expects.
export async function reverseGeocode(lat: number, lon: number, locale: string): Promise<NominatimAddress> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse")
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("lat", String(lat))
  url.searchParams.set("lon", String(lon))
  url.searchParams.set("accept-language", locale === "ar" ? "ar,tr" : "tr")

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error(`nominatim_reverse_failed_${response.status}`)
  }

  const data = (await response.json()) as { address?: NominatimAddress }
  return data.address ?? {}
}
