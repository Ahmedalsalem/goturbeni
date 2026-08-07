import type { MetadataRoute } from "next"

import { getPopularRoutes } from "@/features/routes/popular"
import { getRides } from "@/features/rides/queries"
import { buildRouteSlug } from "@/utils/province-slug"

// Trailing slash is stripped so `${SITE_URL}/path` below never produces `//`
// regardless of how NEXT_PUBLIC_SITE_URL is set in the deployment environment.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/rides`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/rota`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/how-it-works`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/support`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/kvkk`, changeFrequency: "yearly", priority: 0.3 },
  ]

  // Only active listings are worth indexing — full/completed/cancelled rides
  // aren't bookable and would just be dead links in search results.
  const { rides } = await getRides()
  const rideRoutes: MetadataRoute.Sitemap = rides.map((ride) => ({
    url: `${SITE_URL}/rides/${ride.id}`,
    lastModified: ride.updated_at,
    changeFrequency: "hourly",
    priority: 0.6,
  }))

  // Route landing pages stand on their own (distance, cost-sharing, internal
  // links) whether or not a listing exists, so they stay indexable even while
  // the corridor is empty.
  const routeRoutes: MetadataRoute.Sitemap = getPopularRoutes().map((route) => ({
    url: `${SITE_URL}/rota/${buildRouteSlug(route.from, route.to)}`,
    changeFrequency: "daily",
    priority: 0.7,
  }))

  return [...staticRoutes, ...routeRoutes, ...rideRoutes]
}
