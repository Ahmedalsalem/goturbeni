import Link from "next/link"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ArrowRight } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { getPopularRoutes } from "@/features/routes/popular"
import { languageAlternates } from "@/i18n/hreflang"
import { getUserLocale } from "@/i18n/locale"
import { buildRouteSlug } from "@/utils/province-slug"
import { getProvinceDistanceKm } from "@/utils/turkish-provinces-geo"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RoutePage.index")
  const title = t("metaTitle")
  const description = t("metaDescription")
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
    alternates: { canonical: "/rota", languages: languageAlternates("/rota") },
  }
}

export default async function RoutesIndexPage() {
  const [t, locale] = await Promise.all([getTranslations("RoutePage.index"), getUserLocale()])
  const routes = getPopularRoutes()

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("heading")}</h1>
      <p className="text-muted-foreground mt-3 text-lg leading-relaxed text-balance">{t("intro")}</p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {routes.map((route) => (
          <Link key={buildRouteSlug(route.from, route.to)} href={`/rota/${buildRouteSlug(route.from, route.to)}`}>
            <Card className="ring-foreground/5 border-0 shadow-sm transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-medium">
                  {getProvinceDisplayName(route.from, locale)}
                  <ArrowRight className="text-muted-foreground size-4 rtl:-scale-x-100" aria-hidden="true" />
                  {getProvinceDisplayName(route.to, locale)}
                </span>
                <span className="text-muted-foreground text-sm whitespace-nowrap">
                  {t("distance", { km: getProvinceDistanceKm(route.from, route.to) })}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
