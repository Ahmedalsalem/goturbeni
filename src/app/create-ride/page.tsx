import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { requireVerifiedProfile } from "@/lib/supabase/dal"
import { getProfile } from "@/features/profile/queries"
import { RideForm } from "@/features/rides/RideForm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CreateRidePage")
  return { title: t("title") }
}

export default async function CreateRidePage() {
  const user = await requireVerifiedProfile()
  const t = await getTranslations("CreateRidePage")
  const profile = await getProfile(user.id)

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <RideForm defaultCarFeatures={profile?.car_features} defaultCustomCarFeatures={profile?.custom_car_features} />
        </CardContent>
      </Card>
    </div>
  )
}
