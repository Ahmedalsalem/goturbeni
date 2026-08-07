import type { TurkishProvince } from "@/utils/turkish-provinces"

export interface PopularRoute {
  from: TurkishProvince
  to: TurkishProvince
}

// Editorial pick of Türkiye's busiest intercity corridors. It drives the /rota
// index and the sitemap so crawlers land on routes people actually search for;
// any other valid province pair still renders on demand.
const POPULAR_PROVINCES: readonly TurkishProvince[] = [
  "İstanbul",
  "Ankara",
  "İzmir",
  "Bursa",
  "Antalya",
  "Konya",
  "Adana",
  "Gaziantep",
  "Kocaeli",
  "Mersin",
  "Kayseri",
  "Eskişehir",
]

export function getPopularRoutes(): PopularRoute[] {
  const routes: PopularRoute[] = []
  for (const from of POPULAR_PROVINCES) {
    for (const to of POPULAR_PROVINCES) {
      if (from !== to) routes.push({ from, to })
    }
  }
  return routes
}
