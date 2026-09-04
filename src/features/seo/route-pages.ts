import type { TurkishProvince } from "@/utils/turkish-provinces"

export interface RoutePageDef {
  slug: string
  from: TurkishProvince
  to: TurkishProvince
}

export interface CityPageDef {
  slug: string
  city: TurkishProvince
}

// Faz 1 kapsamı yalnızca bu 5 il — genel bir Türkçe→ASCII transliterasyon
// fonksiyonu yerine (İ/ı gibi karakterler locale'e duyarlı, bkz.
// match-turkish-location.ts'nin .toLocaleLowerCase("tr") kullanma nedeni)
// bilinen, sabit bir slug listesi. Kapsam genişlerse (81 ilin tamamı)
// ayrı bir transliterasyon yardımcı fonksiyonu o zaman yazılır.
export const POPULAR_ROUTES: RoutePageDef[] = [
  { slug: "istanbul-ankara-arac-paylasimi", from: "İstanbul", to: "Ankara" },
  { slug: "ankara-istanbul-arac-paylasimi", from: "Ankara", to: "İstanbul" },
  { slug: "istanbul-izmir-arac-paylasimi", from: "İstanbul", to: "İzmir" },
  { slug: "izmir-istanbul-arac-paylasimi", from: "İzmir", to: "İstanbul" },
  { slug: "istanbul-bursa-arac-paylasimi", from: "İstanbul", to: "Bursa" },
  { slug: "bursa-istanbul-arac-paylasimi", from: "Bursa", to: "İstanbul" },
  { slug: "istanbul-kocaeli-arac-paylasimi", from: "İstanbul", to: "Kocaeli" },
  { slug: "kocaeli-istanbul-arac-paylasimi", from: "Kocaeli", to: "İstanbul" },
  { slug: "ankara-izmir-arac-paylasimi", from: "Ankara", to: "İzmir" },
  { slug: "izmir-ankara-arac-paylasimi", from: "İzmir", to: "Ankara" },
]

export const CITY_PAGES: CityPageDef[] = [
  { slug: "istanbul-arac-paylasimi", city: "İstanbul" },
  { slug: "ankara-arac-paylasimi", city: "Ankara" },
  { slug: "izmir-arac-paylasimi", city: "İzmir" },
  { slug: "bursa-arac-paylasimi", city: "Bursa" },
]

export function findRoutePage(slug: string): RoutePageDef | undefined {
  return POPULAR_ROUTES.find((r) => r.slug === slug)
}

export function findCityPage(slug: string): CityPageDef | undefined {
  return CITY_PAGES.find((c) => c.slug === slug)
}

// Bir şehir sayfasında "buradan gerçek popüler rotalar" listesi için —
// POPULAR_ROUTES'un kendisi zaten tam kapsam, ayrı bir veri kaynağı gerekmez.
export function routesFromCity(city: TurkishProvince): RoutePageDef[] {
  return POPULAR_ROUTES.filter((r) => r.from === city)
}

// Bir rota sayfasında "ilgili diğer rotalar" için — aynı şehri içeren,
// kendisi olmayan diğer rotalar (ters yön dahil).
export function relatedRoutes(current: RoutePageDef, limit = 3): RoutePageDef[] {
  return POPULAR_ROUTES.filter(
    (r) => r.slug !== current.slug && (r.from === current.from || r.to === current.from || r.from === current.to || r.to === current.to)
  ).slice(0, limit)
}
