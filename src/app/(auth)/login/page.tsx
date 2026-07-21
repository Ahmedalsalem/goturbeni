import Link from "next/link"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "@/features/auth/LoginForm"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.login")
  return { title: t("title") }
}

export default async function LoginPage() {
  const t = await getTranslations("Auth.login")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <LoginForm />
        <p className="text-muted-foreground text-center text-sm">
          {t("noAccount")}{" "}
          <Link href="/register" className="text-foreground font-medium underline underline-offset-4">
            {t("registerLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
