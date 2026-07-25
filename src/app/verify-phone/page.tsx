import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { verifySession } from "@/lib/supabase/dal"
import { getProfile } from "@/features/profile/queries"
import { VerifyPhoneClient } from "@/features/profile/VerifyPhoneClient"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("VerifyPhone")
  return { title: t("title") }
}

export default async function VerifyPhonePage() {
  const t = await getTranslations("VerifyPhone")
  const user = await verifySession()
  const profile = await getProfile(user.id)

  // Already fully verified (e.g. a stale bookmark, or a link followed after
  // completing the flow in another tab) — nothing left to do here.
  if (profile?.phone_verified && profile.gender) {
    redirect("/rides")
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <Card>
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <VerifyPhoneClient gender={profile?.gender ?? null} phone={profile?.phone ?? null} />
        </CardContent>
      </Card>
    </div>
  )
}
