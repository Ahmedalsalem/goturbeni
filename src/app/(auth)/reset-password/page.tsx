import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ShieldAlert } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getCurrentUser } from "@/lib/supabase/dal"
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.resetPassword")
  return { title: t("title") }
}

export default async function ResetPasswordPage() {
  const t = await getTranslations("Auth.resetPassword")
  const user = await getCurrentUser()

  if (!user) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <ShieldAlert className="text-muted-foreground size-10" aria-hidden="true" />
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("invalidLink")}</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Link href="/forgot-password" className="text-foreground text-sm font-medium underline underline-offset-4">
            {t("requestNewLink")}
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <ResetPasswordForm />
      </CardContent>
    </Card>
  )
}
