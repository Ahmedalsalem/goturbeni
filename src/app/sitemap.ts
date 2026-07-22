import type { MetadataRoute } from "next"

import { getRides } from "@/features/rides/queries"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/rides`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/how-it-works`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/support`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/kvkk`, changeFrequency: "yearly", priority: 0.3 },
  ]

  // Only active listings are worth indexing — full/completed/cancelled rides
  // aren't bookable and would just be dead links in search results.
  const rides = await getRides()
  const rideRoutes: MetadataRoute.Sitemap = rides.map((ride) => ({
    url: `${SITE_URL}/rides/${ride.id}`,
    lastModified: ride.updated_at,
    changeFrequency: "hourly",
    priority: 0.6,
  }))

  return [...staticRoutes, ...rideRoutes]
}
