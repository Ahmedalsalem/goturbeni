import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { HomeHero } from "@/features/rides/HomeHero"
import { getProfile } from "@/features/profile/queries"
import { languageAlternates } from "@/i18n/hreflang"
import { getCurrentUser } from "@/lib/supabase/dal"

export async function generateMetadata(): Promise<Metadata> {
  const [t, tMeta] = await Promise.all([getTranslations("HomePage"), getTranslations("Metadata")])
  const pageTitle = t("metaTitle")
  const description = t("metaDescription")
  // The root layout's title template ("%s | GötürBeni") doesn't apply here —
  // layout.tsx and this page.tsx resolve to the same route segment ("/"), and
  // Next only cascades a parent's template into genuinely nested segments.
  const title = `${pageTitle} | ${tMeta("title")}`

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
    alternates: { canonical: "/", languages: languageAlternates("/") },
  }
}

export default async function HomePage() {
  const user = await getCurrentUser()
  const profile = user ? await getProfile(user.id) : null
  const isFemaleUser = profile?.gender === "female"

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
      <HomeHero isFemaleUser={isFemaleUser} />
    </div>
  )
}
