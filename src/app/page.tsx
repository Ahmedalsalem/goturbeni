import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { HomeHero } from "@/features/rides/HomeHero"
import { HomeTrustSection } from "@/components/HomeTrustSection"
import { languageAlternates } from "@/i18n/hreflang"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("HomePage")
  const description = t("metaDescription")
  // No title here on purpose: the root layout's `default` ("GötürBeni") is
  // what should show for the homepage — a brand-only <title> is what makes
  // Google's result for an exact "götürbeni" search read "GötürBeni" instead
  // of the longer keyword tagline. The template ("%s | GötürBeni") still
  // applies normally to every other route, which does set its own title.

  return {
    description,
    openGraph: { description },
    twitter: { description },
    alternates: { canonical: "/", languages: languageAlternates("/") },
  }
}

export default function HomePage() {
  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="from-primary/10 pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem] bg-gradient-to-b via-transparent to-transparent"
      />
      <div
        aria-hidden="true"
        className="bg-primary/15 pointer-events-none absolute start-1/2 top-[-12rem] -z-10 size-[42rem] -translate-x-1/2 rounded-full blur-3xl"
      />
      <HomeHero />
      <HomeTrustSection />
    </div>
  )
}
