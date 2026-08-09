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
import { ReceiptUploadForm } from "@/features/bookings/ReceiptUploadForm"
import { submitDepositReceipt } from "@/features/bookings/actions"
import { OpenDisputeButton } from "@/features/disputes/OpenDisputeButton"
import { getMyDisputeForBooking } from "@/features/disputes/queries"
import { getMyPickupCode } from "@/features/pickup/queries"
import { getMyBookings, getMyDriverOffers, getRideCounterpartyPhone, getRideDriverPaymentInfo } from "@/features/bookings/queries"
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
  const tPayment = await getTranslations("Bookings.payment")
  const tPickup = await getTranslations("Pickup.passenger")
  const user = await verifySession()
  const format = await getFormatter()
  const locale = await getUserLocale()
  const [bookings, unreadMessages] = await Promise.all([getMyBookings(user.id), getUnreadMessages(user.id)])
  const myOffers = await getMyDriverOffers(user.id)
  // Task 2'nin depozito-sırası düzeltmesiyle mümkün olan tek yeni durum:
  // teklifim onaylandı ama henüz depozito ödemedim (payment_status hâlâ
  // 'awaiting_deposit' — normal rezervasyonlarda approved olmak zaten
  // deposit_confirmed anlamına geldiğinden bu satır normalde asla
  // oluşmaz). Sadece bu durumdaki, kendi (yolcu olarak) rezervasyonlarım
  // için IBAN'a ihtiyaç var, tek tek çekiliyor.
  const awaitingOfferDeposits = bookings.filter((booking) => booking.status === "approved" && booking.payment_status === "awaiting_deposit")
  const offerDepositPaymentInfo = new Map(
    await Promise.all(
      awaitingOfferDeposits.map(async (booking) => [booking.id, await getRideDriverPaymentInfo(booking.ride.id)] as const)
    )
  )

  // Onaylanmış her booking'de driver_id atanmış olur (approve_booking bunu
  // garanti eder, yolcu ilanlarında bile) — ama tip artık nullable (Faz 2A),
  // bu yüzden aşağıdaki her kullanım yerinde savunmacı bir null kontrolü var.
  const completedBookings = bookings.filter(
    (booking) => booking.status === "approved" && booking.ride.driver_id !== null && new Date(booking.ride.departure_time) < new Date()
  )
  const myReviews = await Promise.all(
    completedBookings.map((booking) => getMyReviewForRide(booking.ride.id, user.id, booking.ride.driver_id!))
  )
  const reviewedRideIds = new Set(completedBookings.filter((_, index) => myReviews[index]).map((booking) => booking.ride.id))
  const approvedBookings = bookings.filter((booking) => booking.status === "approved")
  const upcomingApprovedBookings = approvedBookings.filter((booking) => new Date(booking.ride.departure_time) >= new Date())
  const driverPhones = new Map(
    await Promise.all(
      approvedBookings
        .filter((booking) => booking.ride.driver_id !== null)
        .map(
          async (booking) => [booking.ride.id, await getRideCounterpartyPhone(booking.ride.id, booking.ride.driver_id!)] as const
        )
    )
  )
  const liveLocations = new Map(
    await Promise.all(
      upcomingApprovedBookings.map(async (booking) => [booking.ride.id, await getRideLiveLocation(booking.ride.id)] as const)
    )
  )
  const myDisputes = new Map(
    await Promise.all(approvedBookings.map(async (booking) => [booking.id, await getMyDisputeForBooking(booking.id, user.id)] as const))
  )
  const pickupCodes = new Map(
    await Promise.all(approvedBookings.map(async (booking) => [booking.id, await getMyPickupCode(booking.id)] as const))
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
                {booking.status === "approved" &&
                  pickupCodes.get(booking.id) &&
                  (pickupCodes.get(booking.id)!.verified_at ? (
                    <CardFooter>
                      <Badge variant="success">{tPickup("verified")}</Badge>
                    </CardFooter>
                  ) : (
                    <CardFooter>
                      <Badge variant="secondary">
                        {tPickup("codeLabel")}: <span className="font-mono">{pickupCodes.get(booking.id)!.code}</span>
                      </Badge>
                    </CardFooter>
                  ))}
                {booking.status === "approved" && booking.payment_status === "awaiting_deposit" && (
                  <CardFooter className="flex flex-col items-start gap-2">
                    {offerDepositPaymentInfo.get(booking.id) && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">{tPayment("ibanLabel")}: </span>
                        <span className="font-mono font-medium">{offerDepositPaymentInfo.get(booking.id)?.iban}</span>
                        <span className="text-muted-foreground"> · {tPayment("ibanHolderLabel")}: </span>
                        {offerDepositPaymentInfo.get(booking.id)?.iban_holder_name}
                      </div>
                    )}
                    {booking.deposit_receipt_status === null || booking.deposit_receipt_status === "rejected" ? (
                      <ReceiptUploadForm
                        action={(formData) => submitDepositReceipt(booking.id, booking.ride.id, formData)}
                        label={tPayment("uploadReceipt")}
                      />
                    ) : (
                      <Badge variant={booking.deposit_receipt_status === "approved" ? "secondary" : "outline"}>
                        {tPayment(`receiptStatus.${booking.deposit_receipt_status}`)}
                      </Badge>
                    )}
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
                      ) : booking.ride.driver_id ? (
                        <ReviewButton rideId={booking.ride.id} revieweeId={booking.ride.driver_id} />
                      ) : null)}
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
                    {booking.status === "approved" && <OpenDisputeButton bookingId={booking.id} alreadyOpen={!!myDisputes.get(booking.id)} />}
                  </CardFooter>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {myOffers.length > 0 && (
        <div className="mt-10 flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{t("myOffersTitle")}</h2>
          {myOffers.map((offer) => (
            <Card key={offer.id}>
              <CardHeader className="flex items-center justify-between gap-4">
                <Link href={`/rides/${offer.ride.id}`} className="font-semibold hover:underline">
                  {getProvinceDisplayName(offer.ride.departure_city, locale)} → {getProvinceDisplayName(offer.ride.arrival_city, locale)}
                </Link>
                <BookingStatusBadge status={offer.status} />
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <div>{format.dateTime(new Date(offer.ride.departure_time), { day: "2-digit", month: "2-digit", year: "numeric" })}</div>
                <div className="font-medium">{formatCostShare(offer.ride.cost_share, locale)}</div>
              </CardContent>
              <CardFooter className="flex flex-wrap items-center gap-2">
                {offer.status === "pending" && <CancelBookingButton bookingId={offer.id} rideId={offer.ride.id} />}
                {offer.status === "approved" && (
                  <Link href={`/rides/${offer.ride.id}/bookings`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {tBookingActions("manageOffer")}
                  </Link>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
