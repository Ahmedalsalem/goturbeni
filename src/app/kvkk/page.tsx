import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ScrollText } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Legal.kvkk")
  return { title: t("title") }
}

export default async function KvkkPage() {
  const t = await getTranslations("Legal.kvkk")

  const sectionKeys = [
    "controller",
    "categories",
    "purposes",
    "legalBasis",
    "collectionMethod",
    "transfer",
    "rights",
    "application",
  ] as const

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      <div className="mx-auto mb-12 max-w-xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("title")}</h1>
        <p className="text-muted-foreground mt-3 text-lg leading-relaxed text-balance">{t("intro")}</p>
      </div>

      <div className="flex flex-col gap-4">
        {sectionKeys.map((key) => {
          const body = t.raw(`sections.${key}.body`) as string[]
          const items = t.raw(`sections.${key}.items`) as string[]

          return (
            <Card key={key} className="ring-foreground/5 border-0 shadow-sm">
              <CardContent className="flex items-start gap-4">
                <ScrollText className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold">{t(`sections.${key}.heading`)}</h2>
                  {body.map((paragraph, index) => (
                    <p key={index} className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                  {items.length > 0 && (
                    <ul className="text-muted-foreground mt-1.5 list-disc space-y-1 ps-5 text-sm leading-relaxed">
                      {items.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
