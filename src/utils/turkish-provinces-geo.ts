import { TURKISH_PROVINCES, type TurkishProvince } from "./turkish-provinces"

// Approximate provincial-capital coordinates (public-domain-level accuracy,
// [lat, lng]) — a heuristic for "geographically nearby province" ride
// search, not a precision geodata source. Good enough to distinguish
// neighboring provinces (e.g. Kocaeli/Sakarya from İstanbul) from distant
// ones (e.g. Van), which is all this fallback needs.
const PROVINCE_COORDINATES: Record<TurkishProvince, readonly [number, number]> = {
  Adana: [37.0, 35.3213],
  Adıyaman: [37.7648, 38.2786],
  Afyonkarahisar: [38.7507, 30.5567],
  Ağrı: [39.7191, 43.0503],
  Amasya: [40.6499, 35.8353],
  Ankara: [39.9334, 32.8597],
  Antalya: [36.8969, 30.7133],
  Artvin: [41.1828, 41.8183],
  Aydın: [37.856, 27.8416],
  Balıkesir: [39.6484, 27.8826],
  Bilecik: [40.1451, 29.9799],
  Bingöl: [38.8855, 40.4966],
  Bitlis: [38.4006, 42.1095],
  Bolu: [40.576, 31.5788],
  Burdur: [37.7203, 30.2908],
  Bursa: [40.1826, 29.0665],
  Çanakkale: [40.1553, 26.4142],
  Çankırı: [40.6013, 33.6134],
  Çorum: [40.5506, 34.9556],
  Denizli: [37.7765, 29.0864],
  Diyarbakır: [37.9144, 40.2306],
  Edirne: [41.6771, 26.5557],
  Elazığ: [38.681, 39.2264],
  Erzincan: [39.75, 39.5],
  Erzurum: [39.9, 41.27],
  Eskişehir: [39.7767, 30.5206],
  Gaziantep: [37.0662, 37.3833],
  Giresun: [40.9128, 38.3895],
  Gümüşhane: [40.4386, 39.5086],
  Hakkari: [37.5744, 43.7408],
  Hatay: [36.4018, 36.3498],
  Isparta: [37.7648, 30.5566],
  Mersin: [36.8, 34.6333],
  İstanbul: [41.0082, 28.9784],
  İzmir: [38.4237, 27.1428],
  Kars: [40.6167, 43.1],
  Kastamonu: [41.3887, 33.7827],
  Kayseri: [38.7312, 35.4787],
  Kırklareli: [41.7333, 27.2167],
  Kırşehir: [39.1425, 34.1709],
  Kocaeli: [40.8533, 29.8815],
  Konya: [37.8746, 32.4932],
  Kütahya: [39.4242, 29.9833],
  Malatya: [38.3552, 38.3095],
  Manisa: [38.6191, 27.4289],
  Kahramanmaraş: [37.5753, 36.9228],
  Mardin: [37.3212, 40.7245],
  Muğla: [37.2153, 28.3636],
  Muş: [38.9462, 41.7539],
  Nevşehir: [38.6939, 34.6857],
  Niğde: [37.9667, 34.6833],
  Ordu: [40.9862, 37.8797],
  Rize: [41.0201, 40.5234],
  Sakarya: [40.694, 30.4358],
  Samsun: [41.2867, 36.33],
  Siirt: [37.9333, 41.95],
  Sinop: [42.0231, 35.1531],
  Sivas: [39.7477, 37.0179],
  Tekirdağ: [40.9833, 27.5167],
  Tokat: [40.3167, 36.55],
  Trabzon: [41.0027, 39.7168],
  Tunceli: [39.1079, 39.5401],
  Şanlıurfa: [37.1591, 38.7969],
  Uşak: [38.6823, 29.4082],
  Van: [38.4891, 43.4089],
  Yozgat: [39.8181, 34.8147],
  Zonguldak: [41.4564, 31.7987],
  Aksaray: [38.3687, 34.036],
  Bayburt: [40.2552, 40.2249],
  Karaman: [37.1759, 33.2287],
  Kırıkkale: [39.8468, 33.5153],
  Batman: [37.8812, 41.1351],
  Şırnak: [37.4187, 42.4918],
  Bartın: [41.6344, 32.3375],
  Ardahan: [41.1105, 42.7022],
  Iğdır: [39.9167, 44.0333],
  Yalova: [40.65, 29.2667],
  Karabük: [41.2061, 32.6204],
  Kilis: [36.7184, 37.1212],
  Osmaniye: [37.0742, 36.2478],
  Düzce: [40.8438, 31.1565],
}

const EARTH_RADIUS_KM = 6371

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

function haversineDistanceKm(a: readonly [number, number], b: readonly [number, number]): number {
  const [lat1, lon1] = a
  const [lat2, lon2] = b
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLon = Math.sin(dLon / 2)
  const h = sinDLat * sinDLat + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * sinDLon * sinDLon
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

// Provinces within maxDistanceKm of `province` (province itself excluded —
// callers that want it included append it separately).
export function getNearbyProvinces(province: TurkishProvince, maxDistanceKm: number): TurkishProvince[] {
  const origin = PROVINCE_COORDINATES[province]
  return TURKISH_PROVINCES.filter((candidate) => candidate !== province && haversineDistanceKm(origin, PROVINCE_COORDINATES[candidate]) <= maxDistanceKm)
}

// Straight-line, not road distance — the coordinates above are approximate
// provincial-capital points, so callers must label this as "kuş uçuşu".
export function getProvinceDistanceKm(from: TurkishProvince, to: TurkishProvince): number {
  return Math.round(haversineDistanceKm(PROVINCE_COORDINATES[from], PROVINCE_COORDINATES[to]))
}
