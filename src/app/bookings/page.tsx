import Link from "next/link"
import type { Metadata } from "next"
import { getFormatter, getTranslations } from "next-intl/server"
import { CalendarClock, MessageCircle } from "lucide-react"

import { EmptyState } from "@/components/EmptyState"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { BookingStatusBadge } from "@/features/bookings/BookingStatusBadge"
import { CancelBookingButton } from "@/features/bookings/CancelBookingButton"
import { getMyBookings } from "@/features/bookings/queries"
import { ReviewButton } from "@/features/reviews/ReviewButton"
import { getMyReviewForRide } from "@/features/reviews/queries"
import { verifySession } from "@/lib/supabase/dal"
import { formatCostShare } from "@/utils/currency"
import { getUserLocale } from "@/i18n/locale"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BookingsPage")
  return { title: t("title") }
}

export default async function BookingsPage() {
  const t = await getTranslations("BookingsPage")
  const tCard = await getTranslations("Bookings.card")
  const tReviewActions = await getTranslations("Reviews.actions")
  const user = await verifySession()
  const format = await getFormatter()
  const locale = await getUserLocale()
  const bookings = await getMyBookings(user.id)

  const completedRideIds = bookings
    .filter((booking) => booking.status === "approved" && new Date(booking.ride.departure_time) < new Date())
    .map((booking) => booking.ride.id)
  const myReviews = await Promise.all(completedRideIds.map((rideId) => getMyReviewForRide(rideId, user.id)))
  const reviewedRideIds = new Set(completedRideIds.filter((_, index) => myReviews[index]))

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>

      {bookings.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-4">
          {bookings.map((booking) => {
            const isCompleted = booking.status === "approved" && new Date(booking.ride.departure_time) < new Date()

            return (
              <Card key={booking.id}>
                <CardHeader className="flex items-center justify-between gap-4">
                  <Link href={`/rides/${booking.ride.id}`} className="font-semibold hover:underline">
                    {booking.ride.departure_city} → {booking.ride.arrival_city}
                  </Link>
                  <BookingStatusBadge status={booking.status} />
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div>{format.dateTime(new Date(booking.ride.departure_time), { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                  <div>{tCard("seatCount", { count: booking.seat_count })}</div>
                  <div className="font-medium">{formatCostShare(booking.ride.cost_share, locale)}</div>
                </CardContent>
                {(booking.status === "pending" || booking.status === "approved") && (
                  <CardFooter className="flex flex-wrap items-center gap-2">
                    <CancelBookingButton bookingId={booking.id} rideId={booking.ride.id} />
                    {booking.status === "approved" && (
                      <Link href={`/rides/${booking.ride.id}/chat`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        <MessageCircle className="size-4" aria-hidden="true" />
                        {t("chat")}
                      </Link>
                    )}
                    {isCompleted &&
                      (reviewedRideIds.has(booking.ride.id) ? (
                        <Badge variant="secondary">{tReviewActions("alreadyReviewed")}</Badge>
                      ) : (
                        <ReviewButton rideId={booking.ride.id} revieweeId={booking.ride.driver_id} />
                      ))}
                  </CardFooter>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
