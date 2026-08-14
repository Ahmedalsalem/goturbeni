import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { ArrowRight, CalendarDays, Cigarette, Clock, Crown, LogIn, MapPin, PawPrint, Users } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"
import { RideStatusBadge } from "@/features/rides/RideStatusBadge"
import { getDriverCompletedRideCount, getRideWithDriver } from "@/features/rides/queries"
import { getProfile, isPhoneVerified } from "@/features/profile/queries"
import { getMyBookingForRide, getMyOfferForRide, getRideDriverPaymentInfo } from "@/features/bookings/queries"
import { BookingButton } from "@/features/bookings/BookingButton"
import { OfferButton } from "@/features/bookings/OfferButton"
import { ReviewSection } from "@/features/reviews/ReviewSection"
import { getReviewStats } from "@/features/reviews/queries"
import { StarRating } from "@/features/reviews/StarRating"
import { getMyWaitlistEntry } from "@/features/waitlist/queries"
import { WaitlistButton } from "@/features/waitlist/WaitlistButton"
import { formatCostShare } from "@/utils/currency"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"
import { getUserLocale } from "@/i18n/locale"
import { languageAlternates } from "@/i18n/hreflang"
import { getCurrentUser } from "@/lib/supabase/dal"

// Trailing slash is stripped so `${SITE_URL}/path` below never produces `//`
// regardless of how NEXT_PUBLIC_SITE_URL is set in the deployment environment.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "")

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
  // Brand suffix is not appended here — the root layout's title template
  // ("%s | GötürBeni") already adds it, so appending it here would double it up.
  const title = `${departureLabel} → ${arrivalLabel}`
  const description = t("metaDescription", {
    date: format.dateTime(departureAt, { day: "2-digit", month: "2-digit", year: "numeric" }),
    cost: formatCostShare(ride.cost_share, locale),
  })

  return {
    title,
    description,
    openGraph: { title: `${title} | GötürBeni`, description },
    twitter: { title: `${title} | GötürBeni`, description },
    alternates: { canonical: `/rides/${id}`, languages: languageAlternates(`/rides/${id}`) },
  }
}

export default async function RideDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ride = await getRideWithDriver(id)
  if (!ride) {
    notFound()
  }

  const [t, tCard, tNav, tReviews, tBookings, format, locale, user] = await Promise.all([
    getTranslations("RideDetailPage"),
    getTranslations("Rides.card"),
    getTranslations("Nav"),
    getTranslations("Reviews"),
    getTranslations("Bookings.loginPrompt"),
    getFormatter(),
    getUserLocale(),
    getCurrentUser(),
  ])

  const isPassengerListing = ride.posted_by_role === "passenger"
  // Yolcu ilanında "profil kartı" ilan sahibini (poster) gösterir, henüz
  // atanmamış bir sürücüyü değil — driver_id onay anına kadar NULL (Faz 2A).
  const posterProfile = isPassengerListing ? await getProfile(ride.posted_by) : null
  const [driverProfile, driverReviewStats] = ride.driver_id
    ? await Promise.all([getProfile(ride.driver_id), getReviewStats(ride.driver_id)])
    : [null, { averageRating: null, reviewCount: 0 }]
  const [existingBooking, existingOffer, userVerified] = user
    ? await Promise.all([
        isPassengerListing ? Promise.resolve(null) : getMyBookingForRide(ride.id, user.id),
        isPassengerListing ? getMyOfferForRide(ride.id, user.id) : Promise.resolve(null),
        isPhoneVerified(user.id),
      ])
    : [null, null, false]
  const isApprovedAwaitingPayment = existingBooking?.status === "approved" && existingBooking.payment_status !== "settled"
  const [driverPaymentInfo, driverCompletedRideCount] = isApprovedAwaitingPayment && ride.driver_id
    ? await Promise.all([getRideDriverPaymentInfo(ride.id), getDriverCompletedRideCount(ride.driver_id)])
    : [null, 0]
  // Shown next to the IBAN so the passenger has a trust signal alongside the
  // account they'll eventually send real money to — a fresh, reviewless
  // account is the actual "post a fake ride, collect, vanish" fraud pattern;
  // an IBAN checksum wouldn't catch that (see conversation).
  const driverTrustInfo = isApprovedAwaitingPayment
    ? {
        memberSinceIso: driverProfile?.created_at ?? ride.created_at,
        completedRideCount: driverCompletedRideCount,
        averageRating: driverReviewStats.averageRating,
        reviewCount: driverReviewStats.reviewCount,
      }
    : null

  const departureAt = new Date(ride.departure_time)
  const posterName = isPassengerListing
    ? (ride.poster?.full_name ?? tCard("unknownPoster"))
    : (ride.driver?.full_name ?? tCard("unknownDriver"))
  const posterInitials = posterName.slice(0, 2).toUpperCase()
  const isOwnListing = user ? user.id === ride.posted_by : false
  const isActiveForBooking = ride.status === "active"
  // "Sahip" artık posted_by — sürücü ilanında posted_by=driver_id olduğundan
  // davranış aynı; yolcu ilanında ilan sahibi (henüz driver_id olmayan)
  // kendi ilanına rezervasyon/teklif CTA'sı görmemeli (eskiden sadece
  // driver_id kontrol edildiği için bu bir bug'dı, bkz. Task açıklaması).
  const canBook = user && !isOwnListing && !isPassengerListing && isActiveForBooking && userVerified
  const canOffer = user && !isOwnListing && isPassengerListing && isActiveForBooking && userVerified
  // Guests can view every ride, but only a signed-in, non-owner, phone-
  // verified user can book it — show a CTA instead of hiding the footer
  // outright, so the visitor understands why there's no "reserve" button.
  const showLoginPrompt = !user && isActiveForBooking
  const showVerifyPrompt = user && !isOwnListing && isActiveForBooking && !userVerified
  // A full ride can't take a new booking at all (createBooking hard-rejects
  // non-"active" rides) — offer the waitlist instead of just a dead end.
  // Bir yolcu ilanı tek bir teklifle TAMAMEN kapandığından (kısmi kabul
  // yok) "koltuk açılması" hiç olmaz — bekleme listesi sadece sürücü
  // ilanlarında anlamlı.
  const showWaitlist = user && !isOwnListing && !isPassengerListing && ride.status === "full" && !existingBooking
  const myWaitlistEntry = showWaitlist ? await getMyWaitlistEntry(ride.id, user.id) : null
  const departureCity = getProvinceDisplayName(ride.departure_city, locale)
  const arrivalCity = getProvinceDisplayName(ride.arrival_city, locale)
  const routeLabel = `${departureCity} → ${arrivalCity}`

  const breadcrumbList = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: tNav("home"), item: SITE_URL },
      { "@type": "ListItem", position: 2, name: tNav("rides"), item: `${SITE_URL}/rides` },
      { "@type": "ListItem", position: 3, name: routeLabel, item: `${SITE_URL}/rides/${id}` },
    ],
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbList) }} />
      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <MapPin className="text-muted-foreground size-5" aria-hidden="true" />
            {ride.departure_district ? `${departureCity} (${ride.departure_district})` : departureCity}
            <ArrowRight className="text-muted-foreground size-5 rtl:-scale-x-100" aria-hidden="true" />
            {ride.arrival_district ? `${arrivalCity} (${ride.arrival_district})` : arrivalCity}
          </h1>
          <div className="flex items-center gap-2">
            {ride.vip_solo && (
              <Badge variant="secondary" className="gap-1">
                <Crown className="size-3" aria-hidden="true" /> {tCard("vipSolo")}
              </Badge>
            )}
            <RideStatusBadge status={ride.status} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              <AvatarImage src={(isPassengerListing ? ride.poster?.avatar_url : ride.driver?.avatar_url) ?? undefined} alt={posterName} />
              <AvatarFallback>{posterInitials}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium">{posterName}</p>
                {!isPassengerListing && driverReviewStats.averageRating !== null && (
                  <div className="flex items-center gap-1">
                    <StarRating rating={driverReviewStats.averageRating} size="sm" />
                    <span className="text-muted-foreground text-xs">({driverReviewStats.reviewCount})</span>
                  </div>
                )}
              </div>
              {!isPassengerListing && (ride.driver?.car_brand || ride.driver?.car_model || ride.driver?.car_plate) && (
                <p className="text-muted-foreground text-sm">
                  {[
                    [ride.driver?.car_brand, ride.driver?.car_model].filter(Boolean).join(" "),
                    ride.driver?.car_plate,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {(isPassengerListing ? posterProfile?.bio : driverProfile?.bio) && (
                <p className="text-muted-foreground text-sm">{isPassengerListing ? posterProfile?.bio : driverProfile?.bio}</p>
              )}
            </div>
          </div>

          {(ride.pets_allowed || ride.smoking_allowed) && (
            <div className="flex flex-wrap gap-1.5">
              {ride.pets_allowed && (
                <Badge variant="outline" className="gap-1">
                  <PawPrint className="size-3" aria-hidden="true" /> {tCard("petsAllowed")}
                </Badge>
              )}
              {ride.smoking_allowed && (
                <Badge variant="outline" className="gap-1">
                  <Cigarette className="size-3" aria-hidden="true" /> {tCard("smokingAllowed")}
                </Badge>
              )}
            </div>
          )}

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

          {!isPassengerListing && driverReviewStats.reviewCount > 0 && ride.driver_id && (
            <div>
              <h2 className="mb-1 text-sm font-medium">{tReviews("recentReviews")}</h2>
              <ReviewSection userId={ride.driver_id} limit={3} hideStats />
            </div>
          )}
        </CardContent>
        {canBook && (
          <CardFooter>
            <BookingButton
              rideId={ride.id}
              availableSeats={ride.available_seats}
              existingBooking={existingBooking}
              driverPaymentInfo={driverPaymentInfo}
              driverTrustInfo={driverTrustInfo}
              instantBooking={ride.instant_booking}
            />
          </CardFooter>
        )}
        {canOffer && (
          <CardFooter>
            <OfferButton rideId={ride.id} existingOffer={existingOffer} />
          </CardFooter>
        )}
        {showLoginPrompt && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">{tBookings("message")}</p>
            <Link href="/login" className={buttonVariants({ size: "sm" })}>
              <LogIn className="size-4" aria-hidden="true" /> {tBookings("cta")}
            </Link>
          </CardFooter>
        )}
        {showVerifyPrompt && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">{tBookings("verifyMessage")}</p>
            <Link href="/verify-phone" className={buttonVariants({ size: "sm" })}>
              <LogIn className="size-4" aria-hidden="true" /> {tBookings("verifyCta")}
            </Link>
          </CardFooter>
        )}
        {showWaitlist && (
          <CardFooter className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">{t("waitlistMessage")}</p>
            <WaitlistButton rideId={ride.id} initiallyJoined={myWaitlistEntry !== null} />
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
