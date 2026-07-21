import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"

import { getRide } from "@/features/rides/queries"
import { getMyBookingForRide } from "@/features/bookings/queries"
import { getApprovedPassengers, getMessages } from "@/features/chat/queries"
import { getProfile } from "@/features/profile/queries"
import { ChatWindow } from "@/features/chat/ChatWindow"
import { PassengerPicker } from "@/features/chat/PassengerPicker"
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

  const isDriver = ride.driver_id === user.id
  let counterpartId: string

  if (isDriver) {
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
    if (!booking || booking.status !== "approved") {
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
