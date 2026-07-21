import Link from "next/link"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SignUpForm } from "@/features/auth/SignUpForm"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.register")
  return { title: t("title") }
}

export default async function RegisterPage() {
  const t = await getTranslations("Auth.register")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SignUpForm />
        <p className="text-muted-foreground text-center text-sm">
          {t("haveAccount")}{" "}
          <Link href="/login" className="text-foreground font-medium underline underline-offset-4">
            {t("loginLink")}
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
