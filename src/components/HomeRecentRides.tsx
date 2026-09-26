import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { getTranslations } from "next-intl/server"

import { RideCard } from "@/features/rides/RideCard"
import { getRides } from "@/features/rides/queries"
import { buttonVariants } from "@/components/ui/button"

const RECENT_RIDES_LIMIT = 6

// A freshly posted ride needs to be visible from the very first page a
// visitor lands on, not only after they search — /rides already sorts
// "newest" first (see features/rides/filters.ts), this mirrors that same
// query for the homepage. Statically rendered like the rest of the
// homepage, so — same as [slug]'s route/city pages — the auth gate on click
// is resolved client-side by RideCard/GuestGateLink, never baked into the
// cached HTML for one visitor's session.
export async function HomeRecentRides() {
  const t = await getTranslations("HomePage.recentRides")
  const { rides } = await getRides({ sort: "newest" })
  const recentRides = rides.slice(0, RECENT_RIDES_LIMIT)

  if (recentRides.length === 0) {
    return null
  }

  const guestLoginHref = (rideId: string) => `/login?next=${encodeURIComponent(`/rides/${rideId}`)}`

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 sm:pb-28">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{t("title")}</h2>
          <p className="text-muted-foreground mt-2 text-base leading-relaxed text-balance">{t("subtitle")}</p>
        </div>
        <Link href="/rides" className={buttonVariants({ variant: "outline" })}>
          {t("viewAllCta")} <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      <div className="flex flex-col gap-4">
        {recentRides.map((ride) => (
          <RideCard key={ride.id} ride={ride} requireAuthLoginHref={guestLoginHref(ride.id)} />
        ))}
      </div>
    </div>
  )
}
