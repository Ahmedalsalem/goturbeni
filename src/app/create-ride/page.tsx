import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { verifySession } from "@/lib/supabase/dal"
import { RideForm } from "@/features/rides/RideForm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CreateRidePage")
  return { title: t("title") }
}

export default async function CreateRidePage() {
  await verifySession()
  const t = await getTranslations("CreateRidePage")

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <RideForm />
        </CardContent>
      </Card>
    </div>
  )
}
