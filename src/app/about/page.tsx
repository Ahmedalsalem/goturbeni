import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { HandCoins, Leaf, Lightbulb, ShieldCheck } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { languageAlternates } from "@/i18n/hreflang"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AboutPage")
  const title = t("title")
  const description = t("subtitle")
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
    alternates: { canonical: "/about", languages: languageAlternates("/about") },
  }
}

export default async function AboutPage() {
  const t = await getTranslations("AboutPage")

  const values = [
    { icon: HandCoins, title: t("values.noCommission.title"), description: t("values.noCommission.description") },
    { icon: ShieldCheck, title: t("values.trust.title"), description: t("values.trust.description") },
    { icon: Leaf, title: t("values.sustainability.title"), description: t("values.sustainability.description") },
  ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("title")}</h1>
        <p className="text-muted-foreground mt-3 text-lg leading-relaxed text-balance">{t("subtitle")}</p>
      </div>

      <Card className="ring-foreground/5 border-0 shadow-sm mb-6">
        <CardContent className="flex items-start gap-4">
          <Lightbulb className="text-primary mt-0.5 size-6 shrink-0" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">{t("story.title")}</h2>
            <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t("story.description")}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="ring-foreground/5 border-0 shadow-sm mb-10">
        <CardContent>
          <h2 className="font-semibold">{t("mission.title")}</h2>
          <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t("mission.description")}</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 sm:grid-cols-3">
        {values.map((value) => (
          <Card key={value.title} className="ring-foreground/5 border-0 shadow-sm">
            <CardContent className="flex flex-col items-start gap-4">
              <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-2xl">
                <value.icon className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-semibold">{value.title}</h2>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{value.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-muted-foreground mt-16 text-center text-xs">{t("operator")}</p>
      <p className="text-muted-foreground mt-2 text-center text-sm">{t("contactCta")}</p>
    </div>
  )
}
