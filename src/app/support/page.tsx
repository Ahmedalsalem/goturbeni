import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { HelpCircle, Mail } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { languageAlternates } from "@/i18n/hreflang"

// Same address already used on Terms/Privacy/KVKK pages (messages/*.json) —
// there's no SUPPORT_EMAIL constant anywhere in the codebase yet, so this
// keeps that existing per-string duplication pattern rather than inventing one.
const SUPPORT_EMAIL = "novarodigitalstudio@gmail.com"

const FAQ_CATEGORIES = [
  { key: "booking", items: ["booking", "cancellation", "payment", "depositRejected", "waitlist"] },
  { key: "safety", items: ["safety", "femaleDriver", "pickupCode", "dispute"] },
  { key: "account", items: ["suspendedAccount", "carPlate"] },
] as const

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("SupportPage")
  const title = t("title")
  const description = t("subtitle")
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
    alternates: { canonical: "/support", languages: languageAlternates("/support") },
  }
}

export default async function SupportPage() {
  const t = await getTranslations("SupportPage")

  const allFaqKeys = FAQ_CATEGORIES.flatMap((category) => category.items)

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: allFaqKeys.map((key) => ({
      "@type": "Question",
      name: t(`faq.${key}.question`),
      acceptedAnswer: {
        "@type": "Answer",
        text: t(`faq.${key}.answer`),
      },
    })),
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }} />
      <div className="mx-auto mb-12 max-w-xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("title")}</h1>
        <p className="text-muted-foreground mt-3 text-lg leading-relaxed text-balance">{t("subtitle")}</p>
      </div>

      <Card className="ring-foreground/5 border-0 shadow-sm mb-10">
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Mail className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-semibold">{t("contact.title")}</h2>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t("contact.description")}</p>
            </div>
          </div>
          <a
            href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(SUPPORT_EMAIL)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", className: "shrink-0" })}
          >
            {t("contact.emailCta")}
          </a>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-10">
        {FAQ_CATEGORIES.map((category) => (
          <div key={category.key}>
            <h2 className="mb-4 text-sm font-medium tracking-wide uppercase text-muted-foreground">{t(`categories.${category.key}`)}</h2>
            <div className="flex flex-col gap-4">
              {category.items.map((key) => (
                <Card key={key} className="ring-foreground/5 border-0 shadow-sm">
                  <CardContent className="flex items-start gap-4">
                    <HelpCircle className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
                    <div>
                      <h3 className="font-semibold">{t(`faq.${key}.question`)}</h3>
                      <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{t(`faq.${key}.answer`)}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
