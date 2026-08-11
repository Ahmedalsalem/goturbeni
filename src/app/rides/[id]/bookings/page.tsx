import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { MessageCircle, Phone, Users } from "lucide-react"

import { EmptyState } from "@/components/EmptyState"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { BookingStatusBadge } from "@/features/bookings/BookingStatusBadge"
import { BookingActions } from "@/features/bookings/BookingActions"
import { RefundProofUpload } from "@/features/bookings/RefundProofUpload"
import { ReportNoShowButton } from "@/features/bookings/ReportNoShowButton"
import { SettlePaymentButton } from "@/features/bookings/SettlePaymentButton"
import { OpenDisputeButton } from "@/features/disputes/OpenDisputeButton"
import { getMyDisputeForBooking } from "@/features/disputes/queries"
import { VerifyPickupCodeForm } from "@/features/pickup/VerifyPickupCodeForm"
import { getPickupVerificationStatus } from "@/features/pickup/queries"
import { getRide } from "@/features/rides/queries"
import { getRideBookings, getRideCounterpartyPhone } from "@/features/bookings/queries"
import { ShareLocationToggle } from "@/features/live-location/ShareLocationToggle"
import { getRideWaitlistCount } from "@/features/waitlist/queries"
import { getUnreadMessages } from "@/features/chat/queries"
import { ReviewButton } from "@/features/reviews/ReviewButton"
import { getMyReviewForRide } from "@/features/reviews/queries"
import { verifySession } from "@/lib/supabase/dal"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RideBookingsPage")
  return { title: t("title") }
}

export default async function RideBookingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await verifySession()
  const ride = await getRide(id)

  const isOwner = !!ride && ride.posted_by === user.id
  // Bir yolcu ilanına teklifi onaylanmış sürücü, ilan sahibi olmasa da bu
  // sayfaya erişebilmeli — chat/pickup/settle/no-show/review araçları
  // başka hiçbir yerde yok (bkz. Task açıklaması). ride.driver_id onay
  // öncesi NULL olduğundan bu sadece onay SONRASI erişim verir.
  const isFulfillingDriver = !!ride && !isOwner && ride.driver_id === user.id
  if (!ride || (!isOwner && !isFulfillingDriver)) {
    notFound()
  }

  const t = await getTranslations("RideBookingsPage")
  const tCard = await getTranslations("Bookings.card")
  const tReviewActions = await getTranslations("Reviews.actions")
  const tBookingActions = await getTranslations("Bookings.actions")
  const [allBookings, unreadMessages, waitlistCount] = await Promise.all([
    getRideBookings(id),
    getUnreadMessages(user.id),
    ride.status === "full" ? getRideWaitlistCount(id) : Promise.resolve(0),
  ])
  // İlan sahibi TÜM teklifleri/talepleri görür (onaylama/reddetme için).
  // Teklifi onaylanmış sürücü sadece KENDİ satırını görür — diğer
  // (rakip) sürücülerin bekleyen/reddedilen tekliflerini görmemeli.
  const bookings = isOwner ? allBookings : allBookings.filter((booking) => booking.driver_id === user.id)
  const isRideOver = new Date(ride.departure_time) < new Date()
  const approvedBookings = bookings.filter((booking) => booking.status === "approved")
  // Karşı taraf: eğer BEN bu satırın teklif veren sürücüyüyüm, karşı taraf
  // ilan sahibi (passenger_id); değilsem (ilan sahibiyim) karşı taraf ya
  // teklif veren sürücü (driver_id, yolcu ilanında) ya da rezervasyon
  // talebindeki yolcu (passenger_id, sürücü ilanında — driver_id o
  // durumda hep NULL).
  function counterpartyOf(booking: (typeof bookings)[number]) {
    const viewerIsOfferingDriver = booking.driver_id === user.id
    const id = viewerIsOfferingDriver ? booking.passenger_id : (booking.driver_id ?? booking.passenger_id)
    const profile = viewerIsOfferingDriver ? booking.passenger : (booking.driver ?? booking.passenger)
    const fallbackLabel = viewerIsOfferingDriver || !booking.driver_id ? tCard("unknownPassenger") : tCard("unknownDriver")
    return { id, name: profile?.full_name ?? fallbackLabel, avatarUrl: profile?.avatar_url ?? null }
  }
  const myReviews = isRideOver
    ? await Promise.all(approvedBookings.map((booking) => getMyReviewForRide(id, user.id, counterpartyOf(booking).id)))
    : []
  const reviewedCounterpartyIds = new Set(
    approvedBookings.filter((_, index) => myReviews[index]).map((booking) => counterpartyOf(booking).id)
  )
  const counterpartyPhones = new Map(
    await Promise.all(
      approvedBookings.map(async (booking) => [booking.id, await getRideCounterpartyPhone(id, counterpartyOf(booking).id)] as const)
    )
  )
  const myDisputes = new Map(
    await Promise.all(approvedBookings.map(async (booking) => [booking.id, await getMyDisputeForBooking(booking.id, user.id)] as const))
  )
  const pickupVerified = new Map(
    await Promise.all(approvedBookings.map(async (booking) => [booking.id, await getPickupVerificationStatus(booking.id)] as const))
  )

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground text-sm">{t("description")}</p>
        </div>
        {approvedBookings.length > 0 && !isRideOver && <ShareLocationToggle rideId={id} />}
      </div>

      {isOwner && waitlistCount > 0 && <p className="text-muted-foreground mb-6 text-sm">{t("waitlistCount", { count: waitlistCount })}</p>}

      {bookings.length === 0 ? (
        <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-4">
          {bookings.map((booking) => {
            const counterparty = counterpartyOf(booking)
            const counterpartyInitials = counterparty.name.slice(0, 2).toUpperCase()
            const isApproved = booking.status === "approved"
            const alreadyReviewed = reviewedCounterpartyIds.has(counterparty.id)
            const counterpartyPhone = counterpartyPhones.get(booking.id)
            // Sadece ilan sahibi onaylar/reddeder — teklifi onaylanmış sürücü
            // için bu satır zaten her zaman 'approved' (bkz. yukarıdaki
            // bookings filtresi), yani bu hiç tetiklenmez, ama netlik için
            // isOwner'a bağlı bırakılıyor.
            const isOffer = ride.posted_by_role === "passenger"
            // "Kimin karşı tarafı raporlaması gerekiyor" — normal akışta ben
            // (ilan sahibi=sürücü) yolcuyu raporlarım; yolcu ilanında ben
            // (ilan sahibi=yolcu) sürücüyü raporlarım, teklifi onaylanmış
            // sürücü ise yolcuyu raporlar.
            const viewerReportsDriver = isOwner && isOffer
            const alreadyReportedNoShow = viewerReportsDriver ? booking.driver_no_show : booking.passenger_no_show
            const noShowLabel = viewerReportsDriver ? tBookingActions("reportDriverNoShow") : tBookingActions("reportPassengerNoShow")
            // Karşılıklı "Kalan Ödeme Tamamlandı" onayı — confirmRemainingPayment
            // RPC'si auth.uid()'in hangi taraf olduğunu kendi belirliyor, burada
            // sadece HANGİ flag'in (driver_settled_at/passenger_settled_at)
            // izleyene ait olduğu seçiliyor.
            const viewerIsDriverSide = isOwner ? ride.posted_by_role === "driver" : true
            const viewerSettled = viewerIsDriverSide ? booking.driver_settled_at : booking.passenger_settled_at

            return (
              <Card key={booking.id}>
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarImage src={counterparty.avatarUrl ?? undefined} alt={counterparty.name} />
                      <AvatarFallback>{counterpartyInitials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{counterparty.name}</p>
                      <p className="text-muted-foreground text-sm">{tCard("seatCount", { count: booking.seat_count })}</p>
                      {isApproved && counterpartyPhone && (
                        <a href={`tel:${counterpartyPhone}`} className="text-primary flex items-center gap-1 text-sm hover:underline">
                          <Phone className="size-3.5" aria-hidden="true" /> {counterpartyPhone}
                        </a>
                      )}
                    </div>
                  </div>
                  {isOwner && booking.status === "pending" ? (
                    <BookingActions bookingId={booking.id} rideId={id} isOffer={isOffer} />
                  ) : (
                    <BookingStatusBadge status={booking.status} />
                  )}
                </CardContent>
                {booking.refund_status !== "not_applicable" && (
                  <CardFooter className="flex flex-wrap items-center gap-2">
                    <RefundProofUpload
                      bookingId={booking.id}
                      rideId={id}
                      refundStatus={booking.refund_status}
                      rejectReason={booking.refund_reject_reason}
                    />
                  </CardFooter>
                )}
                {isApproved && (
                  <CardFooter className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/rides/${id}/chat?passengerId=${counterparty.id}`}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "relative" })}
                    >
                      <MessageCircle className="size-4" aria-hidden="true" />
                      {t("chat")}
                      {unreadMessages.threadKeys.has(`${id}:${counterparty.id}`) && (
                        <span className="bg-destructive ring-background absolute -end-1 -top-1 size-2.5 rounded-full ring-2" aria-hidden="true" />
                      )}
                    </Link>
                    <VerifyPickupCodeForm bookingId={booking.id} rideId={id} alreadyVerified={pickupVerified.get(booking.id) ?? false} />
                    {isRideOver && booking.payment_status === "awaiting_settlement" && !viewerSettled && (
                      <SettlePaymentButton bookingId={booking.id} rideId={id} />
                    )}
                    {isRideOver &&
                      (alreadyReviewed ? (
                        <Badge variant="secondary">{tReviewActions("alreadyReviewed")}</Badge>
                      ) : (
                        <ReviewButton rideId={id} revieweeId={counterparty.id} />
                      ))}
                    {isRideOver &&
                      (alreadyReportedNoShow ? (
                        <Badge variant="secondary">{tBookingActions("alreadyReportedNoShow")}</Badge>
                      ) : (
                        <ReportNoShowButton bookingId={booking.id} rideId={id} label={noShowLabel} />
                      ))}
                    <OpenDisputeButton bookingId={booking.id} alreadyOpen={!!myDisputes.get(booking.id)} />
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
