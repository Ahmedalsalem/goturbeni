import { Landmark, ShieldCheck, Wallet } from "lucide-react"
import { getTranslations } from "next-intl/server"

import { Card, CardContent } from "@/components/ui/card"

export async function HomeTrustSection() {
  const t = await getTranslations("HomePage.trustSection")

  const items = [
    { icon: Wallet, title: t("pricing.title"), description: t("pricing.description") },
    { icon: ShieldCheck, title: t("safety.title"), description: t("safety.description") },
    { icon: Landmark, title: t("payment.title"), description: t("payment.description") },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 pb-20 sm:pb-28">
      <div className="grid gap-6 sm:grid-cols-3">
        {items.map((item) => (
          <Card key={item.title} className="ring-foreground/5 border-0 shadow-sm">
            <CardContent className="flex flex-col items-start gap-4">
              <div className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-2xl">
                <item.icon className="size-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="font-semibold">{item.title}</h2>
                <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{item.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
