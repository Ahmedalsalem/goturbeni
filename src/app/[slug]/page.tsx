import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { getTranslations, getFormatter } from "next-intl/server"
import { MapPin } from "lucide-react"

import { RideCard } from "@/features/rides/RideCard"
import { getRides } from "@/features/rides/queries"
import { getProvinceDistanceKm } from "@/utils/turkish-provinces-geo"
import { estimateCostSharePerSeat } from "@/utils/cost-estimate"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"
import { getUserLocale } from "@/i18n/locale"
import { languageAlternates } from "@/i18n/hreflang"
import { POPULAR_ROUTES, CITY_PAGES, findRoutePage, findCityPage, routesFromCity, relatedRoutes } from "@/features/seo/route-pages"

// Trailing slash is stripped so `${SITE_URL}/path` below never produces `//`
// regardless of how NEXT_PUBLIC_SITE_URL is set in the deployment environment.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")

// Bu sayfa headers()'a (x-pathname) hiç dokunmuyor — bilerek: slug zaten
// generateStaticParams'tan geliyor, canonical'ı build-time'da doğrudan
// slug'tan kurmak sayfayı statik/ISR bırakır (diğer sayfaların x-pathname
// nedeniyle zorunlu dinamik olmasından farklı, kasıtlı bir performans kazancı).
export const revalidate = 3600

export function generateStaticParams() {
  return [...POPULAR_ROUTES, ...CITY_PAGES].map((page) => ({ slug: page.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const locale = await getUserLocale()
  const route = findRoutePage(slug)
  const city = findCityPage(slug)

  if (route) {
    const t = await getTranslations({ locale, namespace: "SeoPages.route" })
    const from = getProvinceDisplayName(route.from, locale)
    const to = getProvinceDisplayName(route.to, locale)
    const title = t("title", { from, to })
    const description = t("description", { from, to })
    return {
      title,
      description,
      openGraph: { title, description },
      twitter: { title, description },
      alternates: { canonical: `/${slug}`, languages: languageAlternates(`/${slug}`) },
    }
  }

  if (city) {
    const t = await getTranslations({ locale, namespace: "SeoPages.city" })
    const cityName = getProvinceDisplayName(city.city, locale)
    const title = t("title", { city: cityName })
    const description = t("description", { city: cityName })
    return {
      title,
      description,
      openGraph: { title, description },
      twitter: { title, description },
      alternates: { canonical: `/${slug}`, languages: languageAlternates(`/${slug}`) },
    }
  }

  return {}
}

function BreadcrumbNav({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-muted-foreground mb-6 flex flex-wrap items-center gap-1.5 text-sm">
      {items.map((crumb, index) => (
        <span key={crumb.label} className="flex items-center gap-1.5">
          {index > 0 && <span aria-hidden="true">/</span>}
          {crumb.href ? (
            <Link href={crumb.href} className="hover:text-foreground underline-offset-4 hover:underline">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export default async function SeoLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const route = findRoutePage(slug)
  const city = findCityPage(slug)

  if (!route && !city) {
    notFound()
  }

  const locale = await getUserLocale()
  const format = await getFormatter()
  const tNav = await getTranslations("Nav")
  // This page is statically rendered (revalidate = 3600 below) — deciding
  // guest-vs-member here would bake one visitor's auth state into the cached
  // HTML for everyone until the next revalidation, so RideCard's click gate
  // resolves the real session client-side instead (see GuestGateLink).
  const guestLoginHref = (rideId: string) => `/login?next=${encodeURIComponent(`/rides/${rideId}`)}`

  if (route) {
    const t = await getTranslations("SeoPages.route")
    const from = getProvinceDisplayName(route.from, locale)
    const to = getProvinceDisplayName(route.to, locale)
    const distanceKm = Math.round(getProvinceDistanceKm(route.from, route.to))
    const estimatedCost = estimateCostSharePerSeat(route.from, route.to, 2)
    const { rides } = await getRides({ from: route.from, to: route.to, sort: "date_asc" })
    const related = relatedRoutes(route)

    const breadcrumbList = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: tNav("home"), item: SITE_URL },
        { "@type": "ListItem", position: 2, name: t("h1", { from, to }), item: `${SITE_URL}/${slug}` },
      ],
    }

    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbList) }} />
        <BreadcrumbNav items={[{ label: tNav("home"), href: "/" }, { label: t("h1", { from, to }) }]} />

        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("h1", { from, to })}</h1>
        <p className="text-muted-foreground mt-3 text-lg leading-relaxed text-balance">{t("description", { from, to })}</p>
        <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
          {t("intro", { from, to, distance: distanceKm, cost: format.number(estimatedCost) })}
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/create-ride"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
          >
            {t("ctaCreate")}
          </Link>
        </div>

        <div className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">
            {rides.length > 0 ? t("activeListingsTitle", { count: rides.length }) : t("noListingsTitle")}
          </h2>
          {rides.length > 0 ? (
            <div className="flex flex-col gap-4">
              {rides.slice(0, 10).map((ride) => (
                <RideCard key={ride.id} ride={ride} requireAuthLoginHref={guestLoginHref(ride.id)} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{t("noListingsDescription")}</p>
          )}
        </div>

        {related.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-4 text-xl font-semibold">{t("relatedTitle")}</h2>
            <ul className="flex flex-wrap gap-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/${r.slug}`}
                    className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors"
                  >
                    <MapPin className="size-3.5" aria-hidden="true" />
                    {getProvinceDisplayName(r.from, locale)} → {getProvinceDisplayName(r.to, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // city
  const cityPage = city!
  const t = await getTranslations("SeoPages.city")
  const cityName = getProvinceDisplayName(cityPage.city, locale)
  const cityRoutes = routesFromCity(cityPage.city)
  const { rides } = await getRides({ from: cityPage.city, sort: "date_asc" })

  const breadcrumbList = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: tNav("home"), item: SITE_URL },
      { "@type": "ListItem", position: 2, name: t("h1", { city: cityName }), item: `${SITE_URL}/${slug}` },
    ],
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbList) }} />
      <BreadcrumbNav items={[{ label: tNav("home"), href: "/" }, { label: t("h1", { city: cityName }) }]} />

      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("h1", { city: cityName })}</h1>
      <p className="text-muted-foreground mt-3 text-lg leading-relaxed text-balance">{t("description", { city: cityName })}</p>

      <div className="mt-8">
        <Link
          href={`/rides?from=${encodeURIComponent(cityPage.city)}`}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition-colors"
        >
          {t("ctaSearch", { city: cityName })}
        </Link>
      </div>

      {cityRoutes.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">{t("routesTitle", { city: cityName })}</h2>
          <ul className="flex flex-wrap gap-2">
            {cityRoutes.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/${r.slug}`}
                  className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors"
                >
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {getProvinceDisplayName(r.from, locale)} → {getProvinceDisplayName(r.to, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rides.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 text-xl font-semibold">{cityName}</h2>
          <div className="flex flex-col gap-4">
            {rides.slice(0, 10).map((ride) => (
              <RideCard key={ride.id} ride={ride} requireAuthLoginHref={guestLoginHref(ride.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
