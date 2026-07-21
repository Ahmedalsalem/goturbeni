import Link from "next/link"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { CarFront, Pencil, Plus, Users } from "lucide-react"

import { verifySession } from "@/lib/supabase/dal"
import { getMyRides } from "@/features/rides/queries"
import { RideCard } from "@/features/rides/RideCard"
import { CancelRideButton } from "@/features/rides/CancelRideButton"
import { EmptyState } from "@/components/EmptyState"
import { buttonVariants } from "@/components/ui/button"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("MyRidesPage")
  return { title: t("title") }
}

export default async function MyRidesPage() {
  const t = await getTranslations("MyRidesPage")
  const tMyRides = await getTranslations("Rides.myRides")
  const user = await verifySession()
  const rides = await getMyRides(user.id)

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Link href="/create-ride" className={buttonVariants()}>
          <Plus /> {t("createCta")}
        </Link>
      </div>

      {rides.length === 0 ? (
        <EmptyState icon={CarFront} title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-4">
          {rides.map((ride) => (
            <RideCard
              key={ride.id}
              ride={ride}
              actions={
                ride.status === "active" ? (
                  <div className="flex items-center gap-2">
                    <Link href={`/rides/${ride.id}/bookings`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Users /> {tMyRides("bookings")}
                    </Link>
                    <Link href={`/rides/${ride.id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      <Pencil /> {tMyRides("edit")}
                    </Link>
                    <CancelRideButton rideId={ride.id} />
                  </div>
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
