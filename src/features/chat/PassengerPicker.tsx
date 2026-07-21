import Link from "next/link"
import { getTranslations } from "next-intl/server"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ApprovedPassenger } from "@/features/chat/queries"

// Shown when the driver opens /rides/[id]/chat and has more than one
// approved passenger — messages are 1:1, so the driver has one conversation
// per passenger and needs to pick which one to open.
export async function PassengerPicker({ rideId, passengers }: { rideId: string; passengers: ApprovedPassenger[] }) {
  const t = await getTranslations("ChatPage.passengerPicker")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {passengers.map((passenger) => {
          const name = passenger.full_name ?? t("unknownPassenger")
          const initials = name.slice(0, 2).toUpperCase()

          return (
            <Link
              key={passenger.id}
              href={`/rides/${rideId}/chat?passengerId=${passenger.id}`}
              className="hover:bg-accent flex items-center gap-3 rounded-lg p-2.5 transition-colors"
            >
              <Avatar className="size-9">
                <AvatarImage src={passenger.avatar_url ?? undefined} alt={name} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{name}</span>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
