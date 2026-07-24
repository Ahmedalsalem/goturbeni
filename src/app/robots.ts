import type { MetadataRoute } from "next"

// Trailing slash is stripped so `${SITE_URL}/sitemap.xml` below never
// produces `//` regardless of how NEXT_PUBLIC_SITE_URL is set in the
// deployment environment.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
        "/auth/",
        "/profile",
        "/create-ride",
        "/bookings",
        "/rides/mine",
        "/rides/*/edit",
        "/rides/*/bookings",
        "/rides/*/chat",
        "/offline",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
