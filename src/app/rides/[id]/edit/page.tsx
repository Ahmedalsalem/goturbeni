import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { verifySession } from "@/lib/supabase/dal"
import { getRide } from "@/features/rides/queries"
import { RideForm } from "@/features/rides/RideForm"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("EditRidePage")
  return { title: t("title") }
}

export default async function EditRidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifySession()
  const ride = await getRide(id)

  if (!ride || ride.driver_id !== user.id || ride.status !== "active") {
    notFound()
  }

  const t = await getTranslations("EditRidePage")

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <RideForm ride={ride} />
        </CardContent>
      </Card>
    </div>
  )
}
