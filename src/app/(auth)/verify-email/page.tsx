import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { MailCheck } from "lucide-react"

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.verifyEmail")
  return { title: t("title") }
}

export default async function VerifyEmailPage() {
  const t = await getTranslations("Auth.verifyEmail")

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <MailCheck className="text-muted-foreground size-10" aria-hidden="true" />
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
    </Card>
  )
}
