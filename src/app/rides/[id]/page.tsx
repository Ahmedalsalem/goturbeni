import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { ArrowRight, CalendarDays, Clock, MapPin, Users } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { RideStatusBadge } from "@/features/rides/RideStatusBadge"
import { getRideWithDriver } from "@/features/rides/queries"
import { getProfile } from "@/features/profile/queries"
import { getMyBookingForRide } from "@/features/bookings/queries"
import { BookingButton } from "@/features/bookings/BookingButton"
import { ReviewSection } from "@/features/reviews/ReviewSection"
import { getReviewStats } from "@/features/reviews/queries"
import { StarRating } from "@/features/reviews/StarRating"
import { formatCostShare } from "@/utils/currency"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"
import { getUserLocale } from "@/i18n/locale"
import { getCurrentUser } from "@/lib/supabase/dal"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const ride = await getRideWithDriver(id)
  if (!ride) {
    return {}
  }

  const t = await getTranslations("RideDetailPage")
  const format = await getFormatter()
  const locale = await getUserLocale()
  const departureAt = new Date(ride.departure_time)
  const departureCity = getProvinceDisplayName(ride.departure_city, locale)
  const arrivalCity = getProvinceDisplayName(ride.arrival_city, locale)

  const departureLabel = ride.departure_district ? `${departureCity} (${ride.departure_district})` : departureCity
  const arrivalLabel = ride.arrival_district ? `${arrivalCity} (${ride.arrival_district})` : arrivalCity
  const title = `${departureLabel} → ${arrivalLabel} | GötürBeni`
  const description = t("metaDescription", {
    date: format.dateTime(departureAt, { day: "2-digit", month: "2-digit", year: "numeric" }),
    cost: formatCostShare(ride.cost_share, locale),
  })

  return {
    title,
    description,
    openGraph: { title, description },
    alternates: { canonical: `/rides/${id}` },
  }
}

export default async function RideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ride = await getRideWithDriver(id)
  if (!ride) {
    notFound()
  }

  const [t, tCard, tReviews, format, locale, driverProfile, driverReviewStats, user] = await Promise.all([
    getTranslations("RideDetailPage"),
    getTranslations("Rides.card"),
    getTranslations("Reviews"),
    getFormatter(),
    getUserLocale(),
    getProfile(ride.driver_id),
    getReviewStats(ride.driver_id),
    getCurrentUser(),
  ])
  const existingBooking = user ? await getMyBookingForRide(ride.id, user.id) : null

  const departureAt = new Date(ride.departure_time)
  const driverName = ride.driver?.full_name ?? tCard("unknownDriver")
  const driverInitials = driverName.slice(0, 2).toUpperCase()
  const canBook = user && user.id !== ride.driver_id && ride.status === "active"
  const departureCity = getProvinceDisplayName(ride.departure_city, locale)
  const arrivalCity = getProvinceDisplayName(ride.arrival_city, locale)

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <MapPin className="text-muted-foreground size-5" aria-hidden="true" />
            {ride.departure_district ? `${departureCity} (${ride.departure_district})` : departureCity}
            <ArrowRight className="text-muted-foreground size-5 rtl:-scale-x-100" aria-hidden="true" />
            {ride.arrival_district ? `${arrivalCity} (${ride.arrival_district})` : arrivalCity}
          </h1>
          <RideStatusBadge status={ride.status} />
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarImage src={ride.driver?.avatar_url ?? undefined} alt={driverName} />
              <AvatarFallback>{driverInitials}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{driverName}</p>
                {driverReviewStats.averageRating !== null && (
                  <div className="flex items-center gap-1">
                    <StarRating rating={driverReviewStats.averageRating} size="sm" />
                    <span className="text-muted-foreground text-xs">({driverReviewStats.reviewCount})</span>
                  </div>
                )}
              </div>
              {driverProfile?.bio && <p className="text-muted-foreground text-sm">{driverProfile.bio}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="text-muted-foreground size-4" aria-hidden="true" />
              {format.dateTime(departureAt, { day: "2-digit", month: "2-digit", year: "numeric" })}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="text-muted-foreground size-4" aria-hidden="true" />
              {format.dateTime(departureAt, { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div className="flex items-center gap-2">
              <Users className="text-muted-foreground size-4" aria-hidden="true" />
              {t("seats", { available: ride.available_seats, total: ride.seat_count })}
            </div>
            <div className="font-medium">{formatCostShare(ride.cost_share, locale)}</div>
          </div>

          {ride.description && (
            <div>
              <h2 className="mb-1 text-sm font-medium">{t("descriptionLabel")}</h2>
              <p className="text-muted-foreground text-sm">{ride.description}</p>
            </div>
          )}

          {driverReviewStats.reviewCount > 0 && (
            <div>
              <h2 className="mb-1 text-sm font-medium">{tReviews("recentReviews")}</h2>
              <ReviewSection userId={ride.driver_id} limit={3} hideStats />
            </div>
          )}
        </CardContent>
        {canBook && (
          <CardFooter>
            <BookingButton rideId={ride.id} availableSeats={ride.available_seats} existingBooking={existingBooking} />
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
