import Link from "next/link"
import { MapPin } from "lucide-react"
import { getTranslations } from "next-intl/server"

import { POPULAR_ROUTES } from "@/features/seo/route-pages"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"
import { getUserLocale } from "@/i18n/locale"

// Gerçek, crawl edilebilir <a> linkleri — onClick tabanlı navigasyon değil,
// Googlebot'un görebilmesi için (bkz. SeoPages planı).
export async function HomePopularRoutes() {
  const t = await getTranslations("HomePage.popularRoutes")
  const locale = await getUserLocale()

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 sm:pb-28">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{t("title")}</h2>
        <p className="text-muted-foreground mt-2 text-base leading-relaxed text-balance">{t("subtitle")}</p>
      </div>
      <ul className="flex flex-wrap justify-center gap-2">
        {POPULAR_ROUTES.map((route) => (
          <li key={route.slug}>
            <Link
              href={`/${route.slug}`}
              className="border-border hover:bg-accent inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors"
            >
              <MapPin className="text-muted-foreground size-3.5" aria-hidden="true" />
              {getProvinceDisplayName(route.from, locale)} → {getProvinceDisplayName(route.to, locale)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
