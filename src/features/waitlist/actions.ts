"use server"

import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"

import { createClient } from "@/lib/supabase/server"
import { verifySession } from "@/lib/supabase/dal"
import { getUserLocale } from "@/i18n/locale"
import { logError } from "@/lib/logger"

export interface WaitlistActionState {
  error?: string
  success?: boolean
}

export async function joinRideWaitlist(rideId: string, seatCount: number): Promise<WaitlistActionState> {
  const locale = await getUserLocale()
  const t = await getTranslations({ locale, namespace: "Waitlist.errors" })

  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.from("ride_waitlist").upsert(
    { ride_id: rideId, passenger_id: user.id, seat_count: seatCount },
    { onConflict: "ride_id,passenger_id" }
  )

  if (error) {
    logError(error, "waitlist.joinRideWaitlist")
    return { error: t("joinFailed") }
  }

  revalidatePath(`/rides/${rideId}`)
  return { success: true }
}

export async function leaveRideWaitlist(rideId: string): Promise<WaitlistActionState> {
  const locale = await getUserLocale()
  const t = await getTranslations({ locale, namespace: "Waitlist.errors" })

  const user = await verifySession()
  const supabase = await createClient()
  const { error } = await supabase.from("ride_waitlist").delete().eq("ride_id", rideId).eq("passenger_id", user.id)

  if (error) {
    logError(error, "waitlist.leaveRideWaitlist")
    return { error: t("leaveFailed") }
  }

  revalidatePath(`/rides/${rideId}`)
  return { success: true }
}
