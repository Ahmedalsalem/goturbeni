import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { HelpCircle } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("SupportPage")
  return { title: t("title") }
}

export default async function SupportPage() {
  const t = await getTranslations("SupportPage")

  const faqKeys = ["booking", "cancellation", "payment", "safety"] as const

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      <div className="mx-auto mb-12 max-w-xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("title")}</h1>
        <p className="text-muted-foreground mt-3 text-lg leading-relaxed text-balance">{t("subtitle")}</p>
      </div>

      <div className="flex flex-col gap-4">
        {faqKeys.map((key) => (
          <Card key={key} className="ring-foreground/5 border-0 shadow-sm">
            <CardContent className="flex items-start gap-4">
              <HelpCircle className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div>
                <h2 className="font-semibold">{t(`faq.${key}.question`)}</h2>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t(`faq.${key}.answer`)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
