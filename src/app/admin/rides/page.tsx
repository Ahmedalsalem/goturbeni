import type { Metadata } from "next"
import { ArrowRight, CarFront } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"

import { EmptyState } from "@/components/EmptyState"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { CancelRideButton } from "@/features/admin/CancelRideButton"
import { getAdminRides } from "@/features/admin/queries"
import { RideStatusBadge } from "@/features/rides/RideStatusBadge"
import { getUserLocale } from "@/i18n/locale"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin.rides")
  return { title: t("title") }
}

export default async function AdminRidesPage() {
  const t = await getTranslations("Admin.rides")
  const format = await getFormatter()
  const locale = await getUserLocale()
  const rides = await getAdminRides()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      {rides.length === 0 ? (
        <EmptyState icon={CarFront} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-3">
          {rides.map((ride) => {
            const driverName = ride.driver?.full_name ?? t("unknownDriver")
            const driverInitials = driverName.slice(0, 2).toUpperCase()
            const isCancellable = ride.status === "active" || ride.status === "full"

            return (
              <Card key={ride.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarImage src={ride.driver?.avatar_url ?? undefined} alt={driverName} />
                      <AvatarFallback>{driverInitials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{driverName}</p>
                      <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                        {getProvinceDisplayName(ride.departure_city, locale)}
                        <ArrowRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                        {getProvinceDisplayName(ride.arrival_city, locale)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {format.dateTime(new Date(ride.departure_time), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <RideStatusBadge status={ride.status} />
                    {isCancellable && <CancelRideButton rideId={ride.id} />}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
