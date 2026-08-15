import Link from "next/link"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { CarFront, Plus } from "lucide-react"

import { EmptyState } from "@/components/EmptyState"
import { RideCard } from "@/features/rides/RideCard"
import { RideFilters } from "@/features/rides/RideFilters"
import { getDriverCompletedRideCount, getRides } from "@/features/rides/queries"
import { parseRideSearchParams } from "@/features/rides/filters"
import { hasSearchAlert } from "@/features/search-alerts/queries"
import { SearchAlertToggle } from "@/features/search-alerts/SearchAlertToggle"
import { buttonVariants } from "@/components/ui/button"
import { languageAlternates } from "@/i18n/hreflang"
import { getCurrentUser } from "@/lib/supabase/dal"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("RidesPage")
  const title = t("title")
  const description = t("metaDescription")
  // Canonical points at the bare path — filter query params (from/to/date/
  // sort) shouldn't fragment this into separate indexed pages.
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
    alternates: { canonical: "/rides", languages: languageAlternates("/rides") },
  }
}

export default async function RidesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const t = await getTranslations("RidesPage")
  const filters = parseRideSearchParams(await searchParams)
  const hasActiveFilters = Boolean(filters.from || filters.to || filters.date)
  const [{ rides, usedNearbyDistricts, usedNearbyProvinces }, user] = await Promise.all([getRides(filters), getCurrentUser()])
  // Batched once per unique driver id (not per card — N+1 avoidance,
  // mirrors the Promise.all-over-unique-ids pattern already used in
  // rides/[id]/bookings/page.tsx).
  const uniqueDriverIds = [...new Set(rides.map((ride) => ride.driver_id).filter((id): id is string => id !== null))]
  const completedRideCounts = new Map(
    await Promise.all(uniqueDriverIds.map(async (driverId) => [driverId, await getDriverCompletedRideCount(driverId)] as const))
  )
  const showSearchAlertToggle = Boolean(user && filters.from && filters.to)
  const alreadySubscribed =
    showSearchAlertToggle && user && filters.from && filters.to ? await hasSearchAlert(user.id, filters.from, filters.to) : false

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Link href="/create-ride" className={buttonVariants()}>
          <Plus /> {t("createCta")}
        </Link>
      </div>

      <div className="mb-6">
        <RideFilters initial={filters} />
      </div>

      {showSearchAlertToggle && filters.from && filters.to && (
        <div className="mb-6">
          <SearchAlertToggle departureCity={filters.from} arrivalCity={filters.to} initiallySubscribed={alreadySubscribed} />
        </div>
      )}

      {usedNearbyDistricts && rides.length > 0 && (
        <p className="text-muted-foreground mb-4 text-sm">{t("nearbyDistrictsNotice")}</p>
      )}
      {usedNearbyProvinces && rides.length > 0 && (
        <p className="text-muted-foreground mb-4 text-sm">{t("nearbyProvincesNotice")}</p>
      )}

      {rides.length === 0 ? (
        <EmptyState
          icon={CarFront}
          title={t("emptyTitle")}
          description={hasActiveFilters ? t("emptyFilteredDescription") : t("emptyDescription")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {rides.map((ride) => (
            <RideCard key={ride.id} ride={ride} driverCompletedRideCount={completedRideCounts.get(ride.driver_id ?? "") ?? 0} />
          ))}
        </div>
      )}
    </div>
  )
}
