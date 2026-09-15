import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { requireVerifiedProfile } from "@/lib/supabase/dal"
import { RideForm } from "@/features/rides/RideForm"
import { getProfile } from "@/features/profile/queries"
import { getMissingDriverFields, type MissingDriverField } from "@/features/profile/schemas"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("CreateRidePage")
  return { title: t("title") }
}

const MISSING_FIELD_LABEL_KEY: Record<MissingDriverField, "missingIban" | "missingCarPlate" | "missingCarColor"> = {
  iban: "missingIban",
  carPlate: "missingCarPlate",
  carColor: "missingCarColor",
}

export default async function CreateRidePage() {
  const user = await requireVerifiedProfile()
  const t = await getTranslations("CreateRidePage")
  const tErrors = await getTranslations("Rides.errors")

  // Proactive hint so a driver sees what's missing before filling out the
  // whole ride form, instead of only discovering it via a submit-time error
  // (see features/rides/actions.ts's createRide check for the source of truth).
  const profile = await getProfile(user.id)
  const missing = profile ? getMissingDriverFields(profile) : []
  const driverProfileHint =
    missing.length > 0
      ? tErrors("profileIncomplete", { missing: missing.map((field) => tErrors(MISSING_FIELD_LABEL_KEY[field])).join(", ") })
      : undefined

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <RideForm driverProfileHint={driverProfileHint} />
        </CardContent>
      </Card>
    </div>
  )
}
