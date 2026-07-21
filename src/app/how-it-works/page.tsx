import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { CarFront, MapPinned, MessageCircleQuestion, Search, ShieldCheck } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("HowItWorksPage")
  return { title: t("title") }
}

export default async function HowItWorksPage() {
  const t = await getTranslations("HowItWorksPage")

  const steps = [
    { icon: Search, title: t("steps.search.title"), description: t("steps.search.description") },
    { icon: MapPinned, title: t("steps.request.title"), description: t("steps.request.description") },
    { icon: CarFront, title: t("steps.travel.title"), description: t("steps.travel.description") },
  ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("title")}</h1>
        <p className="text-muted-foreground mt-3 text-lg leading-relaxed text-balance">{t("subtitle")}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-3">
        {steps.map((step, index) => (
          <Card key={step.title} className="ring-foreground/5 border-0 shadow-sm">
            <CardContent className="flex flex-col items-start gap-4">
              <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-2xl">
                <step.icon className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                  {t("stepLabel", { number: index + 1 })}
                </p>
                <h2 className="font-semibold">{step.title}</h2>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{step.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2">
        <Card className="ring-foreground/5 border-0 shadow-sm">
          <CardContent className="flex items-start gap-4">
            <ShieldCheck className="text-primary size-6 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">{t("trust.title")}</h2>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t("trust.description")}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="ring-foreground/5 border-0 shadow-sm">
          <CardContent className="flex items-start gap-4">
            <MessageCircleQuestion className="text-primary size-6 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">{t("help.title")}</h2>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t("help.description")}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
