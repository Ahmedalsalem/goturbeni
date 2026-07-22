import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { MessageCircle, Users } from "lucide-react"

import { EmptyState } from "@/components/EmptyState"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { BookingStatusBadge } from "@/features/bookings/BookingStatusBadge"
import { BookingActions } from "@/features/bookings/BookingActions"
import { getRide } from "@/features/rides/queries"
import { getRideBookings } from "@/features/bookings/queries"
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

  if (!ride || ride.driver_id !== user.id) {
    notFound()
  }

  const t = await getTranslations("RideBookingsPage")
  const tCard = await getTranslations("Bookings.card")
  const tReviewActions = await getTranslations("Reviews.actions")
  const bookings = await getRideBookings(id)
  const unreadMessages = await getUnreadMessages(user.id)
  const isRideOver = new Date(ride.departure_time) < new Date()
  // One review per (ride, reviewer) — a driver with several approved
  // passengers can only leave a single review for this ride, not one per
  // passenger. Once it exists, every row shows "already reviewed".
  const existingReview = isRideOver ? await getMyReviewForRide(id, user.id) : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      {bookings.length === 0 ? (
        <EmptyState icon={Users} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-4">
          {bookings.map((booking) => {
            const passengerName = booking.passenger?.full_name ?? tCard("unknownPassenger")
            const passengerInitials = passengerName.slice(0, 2).toUpperCase()
            const isApproved = booking.status === "approved"
            const alreadyReviewed = Boolean(existingReview)

            return (
              <Card key={booking.id}>
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarImage src={booking.passenger?.avatar_url ?? undefined} alt={passengerName} />
                      <AvatarFallback>{passengerInitials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{passengerName}</p>
                      <p className="text-muted-foreground text-sm">{tCard("seatCount", { count: booking.seat_count })}</p>
                    </div>
                  </div>
                  {booking.status === "pending" ? (
                    <BookingActions bookingId={booking.id} rideId={id} />
                  ) : (
                    <BookingStatusBadge status={booking.status} />
                  )}
                </CardContent>
                {isApproved && (
                  <CardFooter className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/rides/${id}/chat?passengerId=${booking.passenger_id}`}
                      className={buttonVariants({ variant: "outline", size: "sm", className: "relative" })}
                    >
                      <MessageCircle className="size-4" aria-hidden="true" />
                      {t("chat")}
                      {unreadMessages.threadKeys.has(`${id}:${booking.passenger_id}`) && (
                        <span className="bg-destructive ring-background absolute -end-1 -top-1 size-2.5 rounded-full ring-2" aria-hidden="true" />
                      )}
                    </Link>
                    {isRideOver &&
                      (alreadyReviewed ? (
                        <Badge variant="secondary">{tReviewActions("alreadyReviewed")}</Badge>
                      ) : (
                        <ReviewButton rideId={id} revieweeId={booking.passenger_id} />
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
