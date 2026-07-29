import Link from "next/link"
import type { Metadata } from "next"
import { getFormatter, getTranslations } from "next-intl/server"
import { CalendarClock, MessageCircle, Phone } from "lucide-react"

import { EmptyState } from "@/components/EmptyState"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { BookingStatusBadge } from "@/features/bookings/BookingStatusBadge"
import { CancelBookingButton } from "@/features/bookings/CancelBookingButton"
import { ReportNoShowButton } from "@/features/bookings/ReportNoShowButton"
import { SettlementReceiptUpload } from "@/features/bookings/SettlementReceiptUpload"
import { SettlePaymentButton } from "@/features/bookings/SettlePaymentButton"
import { getMyBookings, getRideCounterpartyPhone } from "@/features/bookings/queries"
import { getUnreadMessages } from "@/features/chat/queries"
import { getRideLiveLocation } from "@/features/live-location/queries"
import { LiveLocationSection } from "@/features/live-location/LiveLocationSection"
import { MarkNotificationsRead } from "@/features/notifications/MarkNotificationsRead"
import { ReviewButton } from "@/features/reviews/ReviewButton"
import { getMyReviewForRide } from "@/features/reviews/queries"
import { verifySession } from "@/lib/supabase/dal"
import { formatCostShare } from "@/utils/currency"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"
import { getUserLocale } from "@/i18n/locale"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("BookingsPage")
  return { title: t("title") }
}

export default async function BookingsPage() {
  const t = await getTranslations("BookingsPage")
  const tCard = await getTranslations("Bookings.card")
  const tReviewActions = await getTranslations("Reviews.actions")
  const tBookingActions = await getTranslations("Bookings.actions")
  const user = await verifySession()
  const format = await getFormatter()
  const locale = await getUserLocale()
  const [bookings, unreadMessages] = await Promise.all([getMyBookings(user.id), getUnreadMessages(user.id)])

  const completedBookings = bookings.filter(
    (booking) => booking.status === "approved" && new Date(booking.ride.departure_time) < new Date()
  )
  const myReviews = await Promise.all(
    completedBookings.map((booking) => getMyReviewForRide(booking.ride.id, user.id, booking.ride.driver_id))
  )
  const reviewedRideIds = new Set(completedBookings.filter((_, index) => myReviews[index]).map((booking) => booking.ride.id))
  const approvedBookings = bookings.filter((booking) => booking.status === "approved")
  const upcomingApprovedBookings = approvedBookings.filter((booking) => new Date(booking.ride.departure_time) >= new Date())
  const driverPhones = new Map(
    await Promise.all(
      approvedBookings.map(
        async (booking) => [booking.ride.id, await getRideCounterpartyPhone(booking.ride.id, booking.ride.driver_id)] as const
      )
    )
  )
  const liveLocations = new Map(
    await Promise.all(
      upcomingApprovedBookings.map(async (booking) => [booking.ride.id, await getRideLiveLocation(booking.ride.id)] as const)
    )
  )

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <MarkNotificationsRead navTarget="my_bookings" />
      <h1 className="mb-6 text-2xl font-semibold">{t("title")}</h1>

      {bookings.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-4">
          {bookings.map((booking) => {
            const isCompleted = booking.status === "approved" && new Date(booking.ride.departure_time) < new Date()
            const driverPhone = booking.status === "approved" ? driverPhones.get(booking.ride.id) : null

            return (
              <Card key={booking.id}>
                <CardHeader className="flex items-center justify-between gap-4">
                  <Link href={`/rides/${booking.ride.id}`} className="font-semibold hover:underline">
                    {getProvinceDisplayName(booking.ride.departure_city, locale)} → {getProvinceDisplayName(booking.ride.arrival_city, locale)}
                  </Link>
                  <BookingStatusBadge status={booking.status} />
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div>{format.dateTime(new Date(booking.ride.departure_time), { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                  <div>{tCard("seatCount", { count: booking.seat_count })}</div>
                  <div className="font-medium">{formatCostShare(booking.ride.cost_share, locale)}</div>
                  {driverPhone && (
                    <a href={`tel:${driverPhone}`} className="text-primary flex items-center gap-1 hover:underline">
                      <Phone className="size-3.5" aria-hidden="true" /> {driverPhone}
                    </a>
                  )}
                </CardContent>
                {booking.status === "approved" && !isCompleted && (
                  <CardFooter>
                    <LiveLocationSection rideId={booking.ride.id} initialLocation={liveLocations.get(booking.ride.id) ?? null} />
                  </CardFooter>
                )}
                {(booking.status === "pending" || booking.status === "approved") && (
                  <CardFooter className="flex flex-wrap items-center gap-2">
                    <CancelBookingButton bookingId={booking.id} rideId={booking.ride.id} />
                    {booking.status === "approved" && (
                      <Link href={`/rides/${booking.ride.id}/chat`} className={buttonVariants({ variant: "outline", size: "sm", className: "relative" })}>
                        <MessageCircle className="size-4" aria-hidden="true" />
                        {t("chat")}
                        {unreadMessages.rideIds.has(booking.ride.id) && (
                          <span className="bg-destructive ring-background absolute -end-1 -top-1 size-2.5 rounded-full ring-2" aria-hidden="true" />
                        )}
                      </Link>
                    )}
                    {isCompleted && booking.payment_status === "deposit_confirmed" && !booking.passenger_settled_at && (
                      <SettlePaymentButton bookingId={booking.id} rideId={booking.ride.id} />
                    )}
                    {isCompleted && booking.payment_status !== "settled" && (
                      <SettlementReceiptUpload
                        bookingId={booking.id}
                        rideId={booking.ride.id}
                        status={booking.settlement_receipt_status}
                        rejectReason={booking.settlement_receipt_reject_reason}
                      />
                    )}
                    {isCompleted &&
                      (reviewedRideIds.has(booking.ride.id) ? (
                        <Badge variant="secondary">{tReviewActions("alreadyReviewed")}</Badge>
                      ) : (
                        <ReviewButton rideId={booking.ride.id} revieweeId={booking.ride.driver_id} />
                      ))}
                    {isCompleted &&
                      (booking.driver_no_show ? (
                        <Badge variant="secondary">{tBookingActions("alreadyReportedNoShow")}</Badge>
                      ) : (
                        <ReportNoShowButton
                          bookingId={booking.id}
                          rideId={booking.ride.id}
                          label={tBookingActions("reportDriverNoShow")}
                        />
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
