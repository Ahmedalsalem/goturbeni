import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.forgotPassword")
  return { title: t("title") }
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("Auth.forgotPassword")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  )
}
