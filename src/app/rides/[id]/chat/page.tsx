import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { MessageCircleOff } from "lucide-react"

import { getRide } from "@/features/rides/queries"
import { getMyBookingForRide, getMyOfferForRide } from "@/features/bookings/queries"
import { getApprovedPassengers, getMessages, getOfferingDrivers } from "@/features/chat/queries"
import { getProfile } from "@/features/profile/queries"
import { ChatWindow } from "@/features/chat/ChatWindow"
import { PassengerPicker } from "@/features/chat/PassengerPicker"
import { EmptyState } from "@/components/EmptyState"
import { buttonVariants } from "@/components/ui/button"
import { verifySession } from "@/lib/supabase/dal"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ChatPage")
  return { title: t("title") }
}

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ passengerId?: string }>
}) {
  const { id } = await params
  const { passengerId } = await searchParams
  const user = await verifySession()
  const ride = await getRide(id)
  if (!ride) {
    notFound()
  }
  const tEmpty = await getTranslations("ChatPage.noActiveOffer")

  let counterpartId: string

  // Yolcu ilanı: ilan sahibi (yolcu) <-> teklif veren sürücü(ler). Normal
  // sürücü-ilanı akışından ayrı tutuluyor çünkü ride.driver_id onay anına
  // kadar NULL — teklifler bookings üzerinden (booker_role='driver')
  // izleniyor, onaylı olması ŞART değil (bkz. 0091_offer_chat_before_
  // approval.sql, "Mesaj Yaz" artık onay beklemeden açılıyor).
  if (ride.posted_by_role === "passenger") {
    const isRideOwner = ride.posted_by === user.id
    if (isRideOwner) {
      const offeringDrivers = await getOfferingDrivers(id)
      if (offeringDrivers.length === 0) {
        return (
          <div className="mx-auto max-w-2xl px-4 py-12">
            <EmptyState
              icon={MessageCircleOff}
              title={tEmpty("noOffersTitle")}
              description={tEmpty("noOffersDescription")}
              action={
                <Link href={`/rides/${id}`} className={buttonVariants({ variant: "outline" })}>
                  {tEmpty("backToRide")}
                </Link>
              }
            />
          </div>
        )
      }
      const selected = passengerId
        ? offeringDrivers.find((d) => d.id === passengerId)
        : offeringDrivers.length === 1
          ? offeringDrivers[0]
          : undefined
      if (!selected) {
        return (
          <div className="mx-auto max-w-2xl px-4 py-12">
            <PassengerPicker rideId={id} passengers={offeringDrivers} counterpartRole="driver" />
          </div>
        )
      }
      counterpartId = selected.id
    } else {
      const myOffer = await getMyOfferForRide(id, user.id)
      if (!myOffer || (myOffer.status !== "pending" && myOffer.status !== "approved")) {
        return (
          <div className="mx-auto max-w-2xl px-4 py-12">
            <EmptyState
              icon={MessageCircleOff}
              title={tEmpty("title")}
              description={tEmpty("description")}
              action={
                <Link href={`/rides/${id}`} className={buttonVariants({ variant: "outline" })}>
                  {tEmpty("backToRide")}
                </Link>
              }
            />
          </div>
        )
      }
      counterpartId = ride.posted_by
    }
  } else if (ride.driver_id === user.id) {
    const passengers = await getApprovedPassengers(id)
    if (passengers.length === 0) {
      notFound()
    }
    const selected = passengerId ? passengers.find((p) => p.id === passengerId) : passengers.length === 1 ? passengers[0] : undefined
    if (!selected) {
      return (
        <div className="mx-auto max-w-2xl px-4 py-12">
          <PassengerPicker rideId={id} passengers={passengers} />
        </div>
      )
    }
    counterpartId = selected.id
  } else {
    const booking = await getMyBookingForRide(id, user.id)
    if (!booking || booking.status !== "approved" || !ride.driver_id) {
      notFound()
    }
    counterpartId = ride.driver_id
  }

  const [counterpart, messages] = await Promise.all([getProfile(counterpartId), getMessages(id, user.id, counterpartId)])

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-2xl flex-col px-4 py-6">
      <ChatWindow
        rideId={id}
        currentUserId={user.id}
        counterpart={{
          id: counterpartId,
          full_name: counterpart?.full_name ?? null,
          avatar_url: counterpart?.avatar_url ?? null,
        }}
        initialMessages={messages}
      />
    </div>
  )
}
