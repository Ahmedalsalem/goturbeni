import Link from "next/link"
import { ArrowRight, CalendarDays, Cigarette, Clock, Crown, MapPin, PawPrint, Snowflake, Users } from "lucide-react"
import { getFormatter, getTranslations } from "next-intl/server"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { RideStatusBadge } from "@/features/rides/RideStatusBadge"
import { ExperienceLevelBadge } from "@/features/reviews/ExperienceLevelBadge"
import { estimateCo2SavingsKg } from "@/utils/co2-savings"
import { formatCostShare } from "@/utils/currency"
import { getProvinceDisplayName } from "@/utils/turkish-provinces-ar"
import { getUserLocale } from "@/i18n/locale"
import type { RideWithDriver } from "@/types/ride"
import type { TurkishProvince } from "@/utils/turkish-provinces"

export async function RideCard({
  ride,
  actions,
  driverCompletedRideCount,
}: {
  ride: RideWithDriver
  actions?: React.ReactNode
  driverCompletedRideCount?: number
}) {
  const t = await getTranslations("Rides.card")
  const format = await getFormatter()
  const locale = await getUserLocale()

  const departureAt = new Date(ride.departure_time)
  const isPassengerListing = ride.posted_by_role === "passenger"
  const posterName = isPassengerListing ? (ride.poster?.full_name ?? t("unknownPoster")) : (ride.driver?.full_name ?? t("unknownDriver"))
  const posterAvatarUrl = isPassengerListing ? ride.poster?.avatar_url : ride.driver?.avatar_url
  const posterInitials = posterName.slice(0, 2).toUpperCase()
  const departureCity = getProvinceDisplayName(ride.departure_city, locale)
  const arrivalCity = getProvinceDisplayName(ride.arrival_city, locale)
  const co2SavingsKg = estimateCo2SavingsKg(ride.departure_city as TurkishProvince, ride.arrival_city as TurkishProvince, ride.seat_count)

  return (
    <Card className="ring-foreground/5 border-0 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg hover:shadow-foreground/5">
      <CardHeader className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link
          href={`/rides/${ride.id}`}
          className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight hover:text-primary"
        >
          <MapPin className="text-muted-foreground size-4" aria-hidden="true" />
          {ride.departure_district ? `${departureCity} (${ride.departure_district})` : departureCity}
          <ArrowRight className="text-muted-foreground size-4 rtl:-scale-x-100" aria-hidden="true" />
          {ride.arrival_district ? `${arrivalCity} (${ride.arrival_district})` : arrivalCity}
        </Link>
        <div className="flex items-center gap-2">
          <Badge variant={isPassengerListing ? "secondary" : "outline"} className="gap-1">
            <Users className="size-3" aria-hidden="true" /> {isPassengerListing ? t("passengerListingBadge") : t("driverListingBadge")}
          </Badge>
          {ride.vip_solo && (
            <Badge variant="secondary" className="gap-1">
              <Crown className="size-3" aria-hidden="true" /> {t("vipSolo")}
            </Badge>
          )}
          <RideStatusBadge status={ride.status} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3.5 text-sm sm:grid-cols-4">
        <div className="text-muted-foreground flex items-center gap-2">
          <CalendarDays className="size-4" aria-hidden="true" />
          {format.dateTime(departureAt, { day: "2-digit", month: "2-digit", year: "numeric" })}
        </div>
        <div className="text-muted-foreground flex items-center gap-2">
          <Clock className="size-4" aria-hidden="true" />
          {format.dateTime(departureAt, { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className="text-muted-foreground flex items-center gap-2">
          <Users className="size-4" aria-hidden="true" />
          {t("availableSeats", { count: ride.available_seats })}
        </div>
        <div className="text-primary font-semibold">{formatCostShare(ride.cost_share, locale)}</div>
      </CardContent>
      {(ride.pets_allowed || ride.smoking_allowed || ride.driver?.has_ac) && (
        <CardContent className="flex flex-wrap gap-1.5 pt-0">
          {ride.pets_allowed && (
            <Badge variant="outline" className="gap-1">
              <PawPrint className="size-3" aria-hidden="true" /> {t("petsAllowed")}
            </Badge>
          )}
          {ride.smoking_allowed && (
            <Badge variant="outline" className="gap-1">
              <Cigarette className="size-3" aria-hidden="true" /> {t("smokingAllowed")}
            </Badge>
          )}
          {ride.driver?.has_ac && (
            <Badge variant="outline" className="gap-1">
              <Snowflake className="size-3" aria-hidden="true" /> {t("hasAc")}
            </Badge>
          )}
        </CardContent>
      )}
      {co2SavingsKg > 0 && (
        <CardContent className="text-muted-foreground pt-0 text-xs">{t("co2SavingsShort", { kg: co2SavingsKg })}</CardContent>
      )}
      <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t-0 bg-transparent pt-1">
        <div className="flex items-center gap-2.5">
          <Avatar className="ring-border size-9 ring-1">
            <AvatarImage src={posterAvatarUrl ?? undefined} alt={posterName} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">{posterInitials}</AvatarFallback>
          </Avatar>
          <div>
            <span className="text-sm font-medium">{posterName}</span>
            {!isPassengerListing && driverCompletedRideCount !== undefined && (
              <ExperienceLevelBadge completedRideCount={driverCompletedRideCount} />
            )}
            {!isPassengerListing && (ride.driver?.car_brand || ride.driver?.car_model || ride.driver?.car_plate) && (
              <p className="text-muted-foreground text-xs">
                {[
                  [ride.driver?.car_brand, ride.driver?.car_model].filter(Boolean).join(" "),
                  ride.driver?.car_plate,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </div>
        {actions}
      </CardFooter>
    </Card>
  )
}
