import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"

import { verifySession } from "@/lib/supabase/dal"
import { getProfile } from "@/features/profile/queries"
import { ProfileForm } from "@/features/profile/ProfileForm"
import { ReviewSection } from "@/features/reviews/ReviewSection"
import { getCompletedRidesCount } from "@/features/reviews/queries"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ProfilePage")
  return { title: t("title") }
}

export default async function ProfilePage() {
  const t = await getTranslations("ProfilePage")
  const tReviews = await getTranslations("Reviews")
  const user = await verifySession()
  const [profile, completedRidesCount] = await Promise.all([getProfile(user.id), getCompletedRidesCount(user.id)])

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {profile ? (
              <ProfileForm profile={profile} email={user.email ?? ""} />
            ) : (
              <p className="text-muted-foreground text-sm">{t("loadError")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{tReviews("sectionTitle")}</CardTitle>
            <CardDescription>{tReviews("totalRides", { count: completedRidesCount })}</CardDescription>
          </CardHeader>
          <CardContent>
            <ReviewSection userId={user.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
