import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { MailCheck, ShieldAlert } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth.verifyEmail")
  return { title: t("title") }
}

export default async function VerifyEmailPage() {
  const t = await getTranslations("Auth.verifyEmail")
  // Ticari taşımacılık uyarısı buraya taşındı (2026-09-20 kullanıcı
  // isteği) -- kayıt formunda submit'ten hemen önce göstermek "hesabın
  // kapatılabilir" gibi caydırıcı bir izlenim veriyordu. Hesap zaten
  // oluşturulduktan sonra (e-posta doğrulama bekleme ekranında)
  // göstermek aynı bilgiyi caydırmadan iletir.
  const tRegister = await getTranslations("Auth.register")

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <MailCheck className="text-muted-foreground size-10" aria-hidden="true" />
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert>
          <ShieldAlert />
          <AlertTitle>{tRegister("commercialBanTitle")}</AlertTitle>
          <AlertDescription>{tRegister("commercialBanNotice")}</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}
