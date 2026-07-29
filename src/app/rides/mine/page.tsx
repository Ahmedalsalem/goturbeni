import Link from "next/link"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { CarFront, Pencil, Plus, Users } from "lucide-react"

import { verifySession } from "@/lib/supabase/dal"
import { getMyActiveRideSeries, getMyRides } from "@/features/rides/queries"
import { RideCard } from "@/features/rides/RideCard"
import { CancelRideButton } from "@/features/rides/CancelRideButton"
import { PauseSeriesButton } from "@/features/rides/PauseSeriesButton"
import { EmptyState } from "@/components/EmptyState"
import { Card, CardContent } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { MarkNotificationsRead } from "@/features/notifications/MarkNotificationsRead"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"
import { getWeekdayLabel } from "@/utils/weekday"
import { getUserLocale } from "@/i18n/locale"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("MyRidesPage")
  return { title: t("title") }
}

export default async function MyRidesPage() {
  const t = await getTranslations("MyRidesPage")
  const tMyRides = await getTranslations("Rides.myRides")
  const user = await verifySession()
  const locale = await getUserLocale()
  const [rides, series] = await Promise.all([getMyRides(user.id), getMyActiveRideSeries(user.id)])

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <MarkNotificationsRead navTarget="my_rides" />
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Link href="/create-ride" className={buttonVariants()}>
          <Plus /> {t("createCta")}
        </Link>
      </div>

      {series.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">{tMyRides("activeSeriesTitle")}</h2>
          {series.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm">
                  {getProvinceDisplayName(s.departure_city, locale)} → {getProvinceDisplayName(s.arrival_city, locale)} ·{" "}
                  {tMyRides("everyWeekday", { weekday: getWeekdayLabel(s.weekday, locale) })} · {s.departure_time_of_day.slice(0, 5)}
                </p>
                <PauseSeriesButton seriesId={s.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {rides.length === 0 ? (
        <EmptyState icon={CarFront} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-4">
          {rides.map((ride) => (
            <RideCard
              key={ride.id}
              ride={ride}
              actions={
                <div className="flex flex-wrap items-center gap-2 max-sm:w-full max-sm:justify-end">
                  {/* Booking management (and, from there, chat/review) must stay reachable
                      regardless of ride status — a full/completed ride still has approved
                      passengers to talk to and, once it departs, to review. Edit is status-
                      gated to "active" (matches the "update own ride" RLS policy). Cancel is
                      gated to "active" or "full" (matches cancel_ride_with_bookings' own
                      check, see 0021_cancellation_refunds.sql) — a fully-booked ride (e.g. a
                      VIP one-seat ride) must stay cancellable, since that's exactly the case
                      the refund workflow exists for. */}
                  <Link href={`/rides/${ride.id}/bookings`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <Users /> {tMyRides("bookings")}
                  </Link>
                  {ride.status === "active" && (
                    <Link href={`/rides/${ride.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Pencil /> {tMyRides("edit")}
                    </Link>
                  )}
                  {(ride.status === "active" || ride.status === "full") && <CancelRideButton rideId={ride.id} />}
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
